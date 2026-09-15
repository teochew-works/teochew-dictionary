"""MFCC extraction for the syllable classifier (issue #279).

Deliberately separate from features.py's WORLD-based pitch/duration/level
measurements: this is spectral-envelope detail for identifying *which*
syllable was said, not tone-grading a known one. A local overlapping,
windowed framing helper lives here rather than reusing audio.py's
`frame_rms` (non-overlapping, RMS-only, built for silence detection) — the
two framings serve different jobs and sharing would obscure both. Silence
*boundaries* are still detected via audio.py's `active_bounds_ms`, so a
clip's raw leading/trailing silence doesn't dilute the spectral shape DTW
compares.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache

import numpy as np

from .audio import Wave, active_bounds_ms


@dataclass(frozen=True)
class MfccParams:
    frame_ms: float = 25.0
    hop_ms: float = 10.0
    n_mels: int = 40
    n_mfcc: int = 13
    # Same semantics/default as features.AnalysisParams.silence_db — trims
    # leading/trailing silence before framing so DTW compares syllables, not
    # however much dead air happened to surround each take.
    silence_db: float = -30.0

    @classmethod
    def from_json(cls, raw: dict | None) -> "MfccParams":
        raw = raw or {}
        return cls(
            frame_ms=float(raw.get("frameMs", cls.frame_ms)),
            hop_ms=float(raw.get("hopMs", cls.hop_ms)),
            n_mels=int(raw.get("nMels", cls.n_mels)),
            n_mfcc=int(raw.get("nMfcc", cls.n_mfcc)),
            silence_db=float(raw.get("silenceDb", cls.silence_db)),
        )


def params_as_json(params: MfccParams) -> dict:
    return {k: v for k, v in asdict(params).items()}


def _next_pow2(n: int) -> int:
    return 1 << (max(n, 1) - 1).bit_length()


def _frame_signal(samples: np.ndarray, frame_len: int, hop_len: int) -> np.ndarray:
    """Overlapping frames, shape (n_frames, frame_len). A clip shorter than
    one frame is zero-padded to exactly one frame rather than yielding zero
    frames — extract_mfcc must never return an empty sequence."""
    n = len(samples)
    if n < frame_len:
        padded = np.zeros(frame_len)
        padded[:n] = samples
        return padded[np.newaxis, :]
    n_frames = 1 + (n - frame_len) // hop_len
    idx = np.arange(frame_len)[None, :] + hop_len * np.arange(n_frames)[:, None]
    return samples[idx]


def _hz_to_mel(hz: np.ndarray | float) -> np.ndarray | float:
    return 2595.0 * np.log10(1.0 + hz / 700.0)


def _mel_to_hz(mel: np.ndarray | float) -> np.ndarray | float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


@lru_cache(maxsize=8)
def _mel_filterbank(sample_rate: int, n_fft: int, n_mels: int) -> np.ndarray:
    """Triangular mel filterbank, shape (n_mels, n_fft // 2 + 1).

    Each filter's left/center/right edges are placed at mel-equal spacing
    over [0 Hz, Nyquist] and converted back to Hz (the standard HTK-style
    construction); each rfft bin's weight is the piecewise-linear triangle
    evaluated at that bin's *actual* frequency (continuous, not rounded to
    an integer bin index) — this avoids the classic degenerate-filter
    failure mode where rounding collapses a low-frequency filter to zero
    width. No Slaney-style area normalization: this is a closed system
    (DTW nearest-neighbor between clips run through the same extractor), so
    a per-filter gain that scales reference and query identically doesn't
    change any ranking — flagged as a deliberate simplicity choice, not an
    oversight.
    """
    n_bins = n_fft // 2 + 1
    mel_min, mel_max = 0.0, _hz_to_mel(sample_rate / 2.0)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = _mel_to_hz(mel_points)
    bin_freqs = np.linspace(0.0, sample_rate / 2.0, n_bins)

    fb = np.zeros((n_mels, n_bins))
    for m in range(n_mels):
        left, center, right = hz_points[m], hz_points[m + 1], hz_points[m + 2]
        rising = (bin_freqs - left) / max(center - left, 1e-12)
        falling = (right - bin_freqs) / max(right - center, 1e-12)
        fb[m] = np.clip(np.minimum(rising, falling), 0.0, None)
    return fb


@lru_cache(maxsize=8)
def _dct_basis(n_mfcc: int, n_mels: int) -> np.ndarray:
    """Orthonormal DCT-II basis, shape (n_mfcc, n_mels): `mfcc = basis @ log_mel`.

    Orthonormal scaling (the sqrt(2/N) / sqrt(1/N) factors) is the
    conventional MFCC definition but not load-bearing here either — a
    uniform per-coefficient rescale doesn't change nearest-neighbor
    ranking. Kept for familiarity/debuggability against reference MFCC
    implementations, not because the closed system needs it.
    """
    n = np.arange(n_mels)
    k = np.arange(n_mfcc).reshape(-1, 1)
    basis = np.cos(np.pi / n_mels * (n + 0.5) * k) * np.sqrt(2.0 / n_mels)
    basis[0] *= 1.0 / np.sqrt(2.0)
    return basis


def extract_mfcc(wave: Wave, params: MfccParams) -> list[list[float]]:
    """Frame-major MFCC sequence: `[n_frames][n_mfcc]`. Never empty, even for
    a silent or sub-frame-length clip (see `_frame_signal`)."""
    sr = wave.sample_rate
    start_ms, end_ms = active_bounds_ms(wave.samples, sr, params.silence_db)
    active = wave.samples[int(start_ms * sr / 1000.0) : int(round(end_ms * sr / 1000.0))]

    frame_len = max(1, round(sr * params.frame_ms / 1000.0))
    hop_len = max(1, round(sr * params.hop_ms / 1000.0))
    n_fft = _next_pow2(frame_len)

    frames = _frame_signal(active, frame_len, hop_len)
    windowed = frames * np.hamming(frame_len)[None, :]
    spectrum = np.fft.rfft(windowed, n=n_fft, axis=1)
    power = (np.abs(spectrum) ** 2) / frame_len

    fb = _mel_filterbank(sr, n_fft, params.n_mels)
    mel_energy = power @ fb.T
    log_mel = np.log(np.maximum(mel_energy, 1e-10))

    basis = _dct_basis(params.n_mfcc, params.n_mels)
    mfcc = log_mel @ basis.T
    return [[round(float(v), 6) for v in frame] for frame in mfcc]
