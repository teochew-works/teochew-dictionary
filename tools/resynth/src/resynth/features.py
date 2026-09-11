"""Per-clip features: silence bounds, level, and the WORLD f0 track.

These are the measurements `src/audio/grade.ts` aggregates per Peng'im part
(tone, coda class, initial) into the targets that synthesis renders toward,
and re-measures on the rendered output for its self-check — so the same code
path produces both the targets and the check.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from ._pyworld import pw

from .audio import Wave, active_bounds_ms, db

CONTOUR_POINTS = 20

# Frames whose lowest aperiodicity band is above this are noise, however
# confidently `harvest` reports an f0 for them. It voices a fricative onset or
# room noise at 60–90 Hz readily; the corpus's /s/ frames sit above 0.7, its
# vowels below 0.3, so the threshold is not delicate.
VOICED_APERIODICITY_MAX = 0.5


@dataclass(frozen=True)
class AnalysisParams:
    frame_ms: float = 5.0
    f0_floor_hz: float = 60.0
    f0_ceil_hz: float = 400.0
    silence_db: float = -30.0

    @classmethod
    def from_json(cls, raw: dict | None) -> "AnalysisParams":
        raw = raw or {}
        return cls(
            frame_ms=float(raw.get("frameMs", cls.frame_ms)),
            f0_floor_hz=float(raw.get("f0FloorHz", cls.f0_floor_hz)),
            f0_ceil_hz=float(raw.get("f0CeilHz", cls.f0_ceil_hz)),
            silence_db=float(raw.get("silenceDb", cls.silence_db)),
        )


@dataclass(frozen=True)
class WorldTrack:
    """WORLD's analysis of one clip: f0 per frame (0 = unvoiced), spectral
    envelope and aperiodicity. Kept whole so synthesis can reuse it."""

    f0: np.ndarray
    times_s: np.ndarray
    # Empty (0 × 0) when analysed with `envelope=False` — features never
    # need them, and cheaptrick is the most expensive step by far.
    spectral: np.ndarray
    aperiodic: np.ndarray
    frame_ms: float
    trim_ms: tuple[float, float]


def analyse(
    wave: Wave,
    params: AnalysisParams,
    reference_hz: float | None = None,
    envelope: bool = True,
    active_ms: tuple[float, float] | None = None,
) -> WorldTrack:
    """WORLD analysis of one clip.

    `active_ms` — the region outside leading/trailing silence, when the caller
    already knows it (a render places its own pad); otherwise detected at
    `params.silence_db`, the same absolute bound `silencedetect` uses. A
    render is normalised several dB below the originals, so re-detecting its
    bounds at the absolute threshold would clip a quiet /s/ or a nasal coda
    out of the active region and misreport the onset and voiced span.

    `envelope=False` stops after the f0 track (still aperiodicity-gated) —
    what feature extraction needs, at well under half the cost of a full
    analysis. Synthesis needs the envelope and passes the default.

    `reference_hz` — the f0 the clip *should* be near (its tone's median, when
    known). A track that sits a whole octave from it is folded before the
    spectral envelope is computed: cheaptrick sizes its window from f0, so an
    octave-low track resolves individual harmonics instead of smoothing over
    them and the resynthesis comes out buzzy. Analysis for grading passes no
    reference, so an octave error stays visible in the report.
    """
    x, sr = wave.samples, wave.sample_rate
    f0, t = pw.harvest(x, sr, f0_floor=params.f0_floor_hz, f0_ceil=params.f0_ceil_hz, frame_period=params.frame_ms)
    f0 = pw.stonemask(x, f0, t, sr)

    # Voicing is decided by aperiodicity, not by harvest alone; and the
    # octave fold's reference is the active region only. Both matter for the
    # same reason: harvest "voices" the leading/trailing silence at ~75 Hz,
    # and a median taken over that would fold every genuine 150 Hz vowel
    # frame down an octave — which is exactly the bug this replaced.
    aperiodic = pw.d4c(x, f0, t, sr)
    f0 = np.where(voicing_mask(f0, aperiodic), f0, 0.0)
    trim = active_ms if active_ms is not None else active_bounds_ms(x, sr, params.silence_db)
    times_ms = t * 1000.0
    f0 = fix_octave_jumps(f0, reference=(times_ms >= trim[0]) & (times_ms <= trim[1]))
    if reference_hz is not None:
        f0 = fold_to_reference_octave(f0, reference_hz)

    if not envelope:
        empty = np.zeros((0, 0))
        return WorldTrack(f0=f0, times_s=t, spectral=empty, aperiodic=empty, frame_ms=params.frame_ms, trim_ms=trim)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    return WorldTrack(f0=f0, times_s=t, spectral=sp, aperiodic=ap, frame_ms=params.frame_ms, trim_ms=trim)


def fold_to_reference_octave(f0: np.ndarray, reference_hz: float, tolerance_semitones: float = 4.0) -> np.ndarray:
    """Shift the whole voiced track by an octave if its median sits within
    `tolerance_semitones` of half or double `reference_hz`; otherwise leave it."""
    voiced = f0 > 0
    if voiced.sum() < 3:
        return f0
    semis = 12.0 * np.log2(float(np.median(f0[voiced])) / reference_hz)
    if abs(semis + 12.0) <= tolerance_semitones:
        return np.where(voiced, f0 * 2.0, 0.0)
    if abs(semis - 12.0) <= tolerance_semitones:
        return np.where(voiced, f0 / 2.0, 0.0)
    return f0


def voicing_mask(f0: np.ndarray, aperiodic: np.ndarray, max_aperiodicity: float = VOICED_APERIODICITY_MAX) -> np.ndarray:
    """True where the tracker found an f0 *and* the lowest band is periodic."""
    return (f0 > 0) & (aperiodic[:, 0] < max_aperiodicity)


def fix_octave_jumps(f0: np.ndarray, reference: np.ndarray | None = None, low: float = 0.55, high: float = 1.8) -> np.ndarray:
    """Fold frames that sit an octave off the clip's own median back in.

    A single speaker reading isolated syllables has no legitimate within-clip
    octave leaps; the ones the tracker reports are halving/doubling errors,
    which would otherwise skew both the per-tone contour targets and the
    self-check. Frames more than `high`× the median are halved, less than
    `low`× doubled — one pass, since a genuine error is one octave. The
    median is taken over voiced frames within `reference` (all frames if
    omitted); every voiced frame is then folded against it.
    """
    voiced = f0 > 0
    ref = voiced if reference is None else voiced & reference
    if ref.sum() < 3:
        return f0
    median = float(np.median(f0[ref]))
    fixed = f0.copy()
    fixed[voiced & (f0 > high * median)] /= 2.0
    fixed[voiced & (f0 < low * median)] *= 2.0
    return fixed


def normalised_contour(f0: np.ndarray, times_ms: np.ndarray, start_ms: float, end_ms: float, points: int = CONTOUR_POINTS) -> list[float]:
    """f0 sampled at `points` evenly spaced instants across [start, end], in Hz.

    Interpolated in the log domain across any unvoiced gap inside the voiced
    span, so a brief dropout mid-vowel doesn't punch a hole in the template.
    """
    voiced = f0 > 0
    xs = times_ms[voiced]
    ys = np.log2(f0[voiced])
    grid = np.linspace(start_ms, end_ms, points)
    return [float(2.0 ** v) for v in np.interp(grid, xs, ys)]


def extract_features(
    wave: Wave, params: AnalysisParams, track: WorldTrack | None = None, active_ms: tuple[float, float] | None = None
) -> dict:
    """The JSON-shaped feature record for one clip (see FEATURES_VERSION)."""
    track = track or analyse(wave, params, envelope=False, active_ms=active_ms)
    sr = wave.sample_rate
    total_ms = wave.duration_ms

    trim_start_ms, trim_end_ms = track.trim_ms
    active = wave.samples[int(trim_start_ms * sr / 1000.0) : int(round(trim_end_ms * sr / 1000.0))]
    rms = float(np.sqrt(np.mean(active * active))) if len(active) else 0.0
    peak = float(np.max(np.abs(active))) if len(active) else 0.0

    times_ms = track.times_s * 1000.0
    in_active = (times_ms >= trim_start_ms) & (times_ms <= trim_end_ms)
    voiced = (track.f0 > 0) & in_active
    voiced_idx = np.flatnonzero(voiced)

    if len(voiced_idx) == 0:
        f0_block = {"medianHz": None, "startHz": None, "endHz": None, "contour": None}
        first_voiced_ms = last_voiced_ms = None
        onset_ms = voiced_ms = None
    else:
        first_voiced_ms = float(times_ms[voiced_idx[0]])
        last_voiced_ms = float(times_ms[voiced_idx[-1]])
        f0v = track.f0[voiced]
        f0_block = {
            "medianHz": round(float(np.median(f0v)), 2),
            "startHz": round(float(f0v[0]), 2),
            "endHz": round(float(f0v[-1]), 2),
            "contour": [round(v, 2) for v in normalised_contour(track.f0, times_ms, first_voiced_ms, last_voiced_ms)],
        }
        onset_ms = round(first_voiced_ms - trim_start_ms, 1)
        voiced_ms = round(last_voiced_ms - first_voiced_ms + track.frame_ms, 1)

    active_frames = int(in_active.sum())
    return {
        "totalMs": round(total_ms, 1),
        "sampleRate": sr,
        "trim": {"startMs": round(trim_start_ms, 1), "endMs": round(trim_end_ms, 1)},
        "activeMs": round(trim_end_ms - trim_start_ms, 1),
        "rmsDb": round(db(rms), 2),
        "peakDb": round(db(peak), 2),
        "onsetMs": onset_ms,
        "voicedMs": voiced_ms,
        "voicedRatio": round(float(voiced.sum()) / active_frames, 3) if active_frames else 0.0,
        "f0": f0_block,
    }


def params_as_json(params: AnalysisParams) -> dict:
    return {k: v for k, v in asdict(params).items()}
