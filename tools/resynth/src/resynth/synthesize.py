"""Re-render one clip toward a target composed from its Peng'im parts.

The clip's own spectral envelope and aperiodicity are kept — that is the
speaker, the segments, and the natural initial→vowel coarticulation — while
the dimensions that vary between takes are replaced: the f0 contour with the
tone's template, the unvoiced onset and voiced span with their target
lengths, the level with the corpus target, and the dead air with a fixed pad.
Nothing is spliced across clips, so the failure mode is "a little smooth",
never "sounds spliced".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ._pyworld import pw
from .audio import Wave, db
from .features import AnalysisParams, analyse, normalised_contour


@dataclass(frozen=True)
class Target:
    """Per-syllable rendering target — see `composeTarget` in src/audio/targets.ts."""

    contour_hz: list[float]
    voiced_ms: float
    onset_ms: float | None
    rms_db: float
    peak_ceiling_db: float = -1.0
    pad_ms: float = 50.0
    fade_ms: float = 5.0
    # 1.0 renders the template contour exactly; lower keeps some of the
    # clip's own movement (log-domain blend). Consistency wants 1.0.
    f0_blend: float = 1.0

    @classmethod
    def from_json(cls, raw: dict) -> "Target":
        return cls(
            contour_hz=[float(v) for v in raw["contourHz"]],
            voiced_ms=float(raw["voicedMs"]),
            onset_ms=None if raw.get("onsetMs") is None else float(raw["onsetMs"]),
            rms_db=float(raw["rmsDb"]),
            peak_ceiling_db=float(raw.get("peakCeilingDb", cls.peak_ceiling_db)),
            pad_ms=float(raw.get("padMs", cls.pad_ms)),
            fade_ms=float(raw.get("fadeMs", cls.fade_ms)),
            f0_blend=float(raw.get("f0Blend", cls.f0_blend)),
        )


class UnvoicedClip(Exception):
    """The source has no voiced frames to retune — nothing to render."""


def _resample_rows(rows: np.ndarray, n_out: int) -> np.ndarray:
    """Linearly resample a (frames × bins) matrix to `n_out` frames."""
    n_in = len(rows)
    if n_out <= 0:
        return rows[:0]
    if n_in == 1:
        return np.repeat(rows, n_out, axis=0)
    src = np.linspace(0.0, n_in - 1, n_out)
    lo = np.floor(src).astype(int)
    hi = np.minimum(lo + 1, n_in - 1)
    w = (src - lo)[:, None]
    return rows[lo] * (1.0 - w) + rows[hi] * w


def _ms_to_frames(ms: float, frame_ms: float) -> int:
    return max(1, int(round(ms / frame_ms)))


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x * x))) if len(x) else 0.0


def _match_unvoiced_level(
    y: np.ndarray,
    out_lo: int,
    out_hi: int,
    out_ref: tuple[int, int],
    x: np.ndarray,
    src_lo: int,
    src_hi: int,
    src_ref: tuple[int, int],
    ramp: int,
) -> float:
    """Scale y[out_lo:out_hi] so its level relative to y[out_ref] matches
    x[src_lo:src_hi] relative to x[src_ref], with a linear ramp into the
    reference region. Returns the gain in dB.

    WORLD re-renders noise-excited (unvoiced) frames markedly quieter than
    the original — a resynthesised /s/ can come out 10 dB down on the vowel
    that follows it, which is audible as a weak sibilant and also drops it
    below the silence bound the trim uses. The vowel's level is set globally
    afterwards; this keeps each unvoiced region's level *relative to the
    vowel* what the speaker produced.
    """
    if out_hi <= out_lo or src_hi <= src_lo:
        return 0.0
    src_ratio = _rms(x[src_lo:src_hi]) / max(_rms(x[src_ref[0] : src_ref[1]]), 1e-9)
    out_ratio = _rms(y[out_lo:out_hi]) / max(_rms(y[out_ref[0] : out_ref[1]]), 1e-9)
    if out_ratio <= 0 or src_ratio <= 0:
        return 0.0
    gain = src_ratio / out_ratio
    envelope = np.full(out_hi - out_lo, gain)
    n = min(ramp, len(envelope))
    if n > 0:
        # Ramp toward unity at the end that touches the reference region.
        if out_ref[0] >= out_hi:
            envelope[-n:] = np.linspace(gain, 1.0, n)
        else:
            envelope[:n] = np.linspace(1.0, gain, n)
    y[out_lo:out_hi] *= envelope
    return db(gain)


def render(wave: Wave, params: AnalysisParams, target: Target) -> tuple[Wave, dict]:
    """The re-rendered clip, and what was done to it (for the report)."""
    reference_hz = float(np.exp(np.mean(np.log(target.contour_hz))))
    track = analyse(wave, params, reference_hz=reference_hz)
    sr, frame_ms = wave.sample_rate, track.frame_ms
    times_ms = track.times_s * 1000.0
    start_ms, end_ms = track.trim_ms

    active = np.flatnonzero((times_ms >= start_ms) & (times_ms <= end_ms))
    voiced = np.flatnonzero((track.f0 > 0) & (times_ms >= start_ms) & (times_ms <= end_ms))
    if len(voiced) == 0:
        raise UnvoicedClip("no voiced frames inside the active region")

    # Three regions in source frames: unvoiced onset, voiced span, unvoiced tail.
    onset_src = active[active < voiced[0]]
    voiced_src = np.arange(voiced[0], voiced[-1] + 1)
    tail_src = active[active > voiced[-1]]

    measured_onset_ms = len(onset_src) * frame_ms
    if target.onset_ms is not None and measured_onset_ms > 0:
        n_onset = _ms_to_frames(target.onset_ms, frame_ms)
    else:
        n_onset = len(onset_src)
    n_voiced = _ms_to_frames(target.voiced_ms, frame_ms)
    n_tail = len(tail_src)

    sp_parts, ap_parts = [], []
    if n_onset > 0 and len(onset_src) > 0:
        sp_parts.append(_resample_rows(track.spectral[onset_src], n_onset))
        ap_parts.append(_resample_rows(track.aperiodic[onset_src], n_onset))
    sp_parts.append(_resample_rows(track.spectral[voiced_src], n_voiced))
    ap_parts.append(_resample_rows(track.aperiodic[voiced_src], n_voiced))
    if n_tail > 0:
        sp_parts.append(track.spectral[tail_src])
        ap_parts.append(track.aperiodic[tail_src])
    sp = np.ascontiguousarray(np.vstack(sp_parts))
    ap = np.ascontiguousarray(np.vstack(ap_parts))

    # f0: the template across the new voiced span, blended (log domain) with
    # the clip's own contour resampled to the same length; zero elsewhere.
    n_onset_actual = len(sp_parts[0]) if (n_onset > 0 and len(onset_src) > 0) else 0
    grid = np.linspace(0.0, 1.0, n_voiced)
    template = np.interp(grid, np.linspace(0.0, 1.0, len(target.contour_hz)), np.log2(target.contour_hz))
    own_contour = normalised_contour(track.f0, times_ms, times_ms[voiced[0]], times_ms[voiced[-1]], points=len(target.contour_hz))
    own = np.interp(grid, np.linspace(0.0, 1.0, len(own_contour)), np.log2(own_contour))
    voiced_f0 = 2.0 ** (target.f0_blend * template + (1.0 - target.f0_blend) * own)
    f0 = np.zeros(len(sp))
    f0[n_onset_actual : n_onset_actual + n_voiced] = voiced_f0

    y = pw.synthesize(np.ascontiguousarray(f0), sp, ap, sr, frame_period=frame_ms)

    # Unvoiced onset and tail: restore their level relative to the vowel.
    spf = int(round(sr * frame_ms / 1000.0))  # samples per frame
    x = wave.samples
    src_voiced = (int(voiced_src[0] * spf), int((voiced_src[-1] + 1) * spf))
    out_voiced = (n_onset_actual * spf, (n_onset_actual + n_voiced) * spf)
    ramp = int(sr * target.fade_ms / 1000.0)
    onset_gain_db = tail_gain_db = 0.0
    if n_onset_actual > 0:
        onset_gain_db = _match_unvoiced_level(
            y, 0, out_voiced[0], out_voiced, x, int(onset_src[0] * spf), src_voiced[0], src_voiced, ramp
        )
    if n_tail > 0:
        tail_lo, tail_hi = out_voiced[1], min(len(y), out_voiced[1] + n_tail * spf)
        tail_gain_db = _match_unvoiced_level(
            y, tail_lo, tail_hi, out_voiced, x, src_voiced[1], min(len(x), int((tail_src[-1] + 1) * spf)), src_voiced, ramp
        )

    # Level: RMS to target, then back off if that would clip.
    rms = float(np.sqrt(np.mean(y * y))) if len(y) else 0.0
    gain = 10.0 ** ((target.rms_db - db(rms)) / 20.0) if rms > 0 else 1.0
    peak = float(np.max(np.abs(y))) * gain if len(y) else 0.0
    ceiling = 10.0 ** (target.peak_ceiling_db / 20.0)
    if peak > ceiling:
        gain *= ceiling / peak
    y = y * gain

    # Edge fades, then a fixed pad of real silence either side.
    n_fade = int(sr * target.fade_ms / 1000.0)
    if n_fade > 0 and len(y) > 2 * n_fade:
        ramp = np.linspace(0.0, 1.0, n_fade)
        y[:n_fade] *= ramp
        y[-n_fade:] *= ramp[::-1]
    pad = np.zeros(int(sr * target.pad_ms / 1000.0))
    out = np.concatenate([pad, y, pad])

    info = {
        "referenceHz": round(reference_hz, 2),
        "sourceTrim": {"startMs": round(start_ms, 1), "endMs": round(end_ms, 1)},
        "sourceOnsetMs": round(measured_onset_ms, 1),
        "sourceVoicedMs": round(len(voiced_src) * frame_ms, 1),
        "renderedOnsetMs": round(n_onset_actual * frame_ms, 1),
        "renderedVoicedMs": round(n_voiced * frame_ms, 1),
        "gainDb": round(db(gain), 2),
        "onsetGainDb": round(onset_gain_db, 2),
        "tailGainDb": round(tail_gain_db, 2),
        "activeStartMs": round(target.pad_ms, 1),
        "activeEndMs": round(target.pad_ms + 1000.0 * len(y) / sr, 1),
    }
    return Wave(samples=out, sample_rate=sr), info
