"""WAV loading and the frame-level helpers shared by analysis and synthesis."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import soundfile as sf


@dataclass(frozen=True)
class Wave:
    samples: np.ndarray  # float64, mono, in [-1, 1]
    sample_rate: int

    @property
    def duration_ms(self) -> float:
        return 1000.0 * len(self.samples) / self.sample_rate


def read_wav(path: str) -> Wave:
    """Mono float64. A stereo file is downmixed by averaging — every corpus clip
    is already mono, so this only matters for ad-hoc inputs."""
    data, sr = sf.read(path, dtype="float64", always_2d=True)
    return Wave(samples=data.mean(axis=1), sample_rate=int(sr))


def write_wav(path: str, wave: Wave) -> None:
    sf.write(path, wave.samples, wave.sample_rate, subtype="PCM_16")


def db(x: float) -> float:
    """Amplitude → dBFS, floored so digital silence reports a finite number."""
    return 20.0 * float(np.log10(max(x, 1e-9)))


def frame_rms(samples: np.ndarray, sample_rate: int, frame_ms: float) -> np.ndarray:
    """RMS per non-overlapping frame; a trailing partial frame is kept."""
    n = max(1, int(round(sample_rate * frame_ms / 1000.0)))
    count = int(np.ceil(len(samples) / n))
    padded = np.zeros(count * n)
    padded[: len(samples)] = samples
    frames = padded.reshape(count, n)
    return np.sqrt(np.mean(frames * frames, axis=1))


def active_bounds_ms(samples: np.ndarray, sample_rate: int, silence_db: float, frame_ms: float = 10.0) -> tuple[float, float]:
    """The region outside leading/trailing silence, in ms.

    Same semantics as `ffmpeg -af silencedetect noise=<silence_db>dB` (which
    `src/importers/silence-detect.ts` uses): the first and last frame whose RMS
    is above the threshold bound the active region. Returns (0, duration) for
    a clip that is silent throughout, so callers never get an inverted range.
    """
    rms = frame_rms(samples, sample_rate, frame_ms)
    threshold = 10.0 ** (silence_db / 20.0)
    above = np.flatnonzero(rms > threshold)
    duration_ms = 1000.0 * len(samples) / sample_rate
    if len(above) == 0:
        return 0.0, duration_ms
    start_ms = float(above[0]) * frame_ms
    end_ms = min(duration_ms, float(above[-1] + 1) * frame_ms)
    return start_ms, end_ms
