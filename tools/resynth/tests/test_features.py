from __future__ import annotations

import json

import numpy as np

from resynth import FEATURES_VERSION
from resynth.audio import Wave, active_bounds_ms, write_wav
from resynth.cli import main, run_features
from resynth.features import AnalysisParams, analyse, extract_features, fix_octave_jumps, normalised_contour, voicing_mask

from conftest import SR, silence, tone


def test_active_bounds_match_silencedetect_semantics(syllable_like: Wave):
    start, end = active_bounds_ms(syllable_like.samples, SR, silence_db=-30.0)
    # 200 ms of leading silence, 150 ms trailing, in a 830 ms clip.
    assert abs(start - 200.0) <= 10.0
    assert abs(end - 680.0) <= 10.0


def test_active_bounds_of_pure_silence_is_whole_clip():
    x = silence(300)
    assert active_bounds_ms(x, SR, silence_db=-30.0) == (0.0, 300.0)


def test_features_of_syllable_like_clip(syllable_like: Wave):
    f = extract_features(syllable_like, AnalysisParams())
    assert abs(f["totalMs"] - 830.0) < 1.0
    assert abs(f["activeMs"] - 480.0) <= 20.0
    # The unvoiced onset is the 80 ms noise burst before the vowel.
    assert 40.0 <= f["onsetMs"] <= 120.0
    assert 350.0 <= f["voicedMs"] <= 450.0
    assert abs(f["f0"]["medianHz"] - 150.0) < 3.0
    assert len(f["f0"]["contour"]) == 20
    # The first/last voiced frame straddles a segment boundary; the interior is flat.
    assert all(abs(v - 150.0) < 5.0 for v in f["f0"]["contour"][1:-1])
    assert all(abs(v - 150.0) < 20.0 for v in f["f0"]["contour"])
    assert f["voicedRatio"] > 0.7
    assert -20.0 < f["rmsDb"] < 0.0
    assert f["peakDb"] <= 0.0


def test_features_of_unvoiced_clip_report_null_f0():
    x = np.concatenate([silence(50), 0.2 * np.random.default_rng(1).standard_normal(SR // 5), silence(50)])
    f = extract_features(Wave(samples=x, sample_rate=SR), AnalysisParams())
    assert f["f0"] == {"medianHz": None, "startHz": None, "endHz": None, "contour": None}
    assert f["onsetMs"] is None and f["voicedMs"] is None


def test_fix_octave_jumps_folds_outliers_to_the_median():
    f0 = np.array([0.0, 140.0, 142.0, 280.0, 141.0, 70.0, 139.0, 0.0])
    fixed = fix_octave_jumps(f0)
    assert fixed.tolist() == [0.0, 140.0, 142.0, 140.0, 141.0, 140.0, 139.0, 0.0]


def test_fix_octave_jumps_takes_its_reference_from_the_given_frames_only():
    # Six frames of 75 Hz "voiced" noise, then three genuine 150 Hz vowel frames.
    f0 = np.array([75.0] * 6 + [150.0] * 3)
    reference = np.array([False] * 6 + [True] * 3)
    # Without a reference the noise wins the median and the vowel is halved.
    assert fix_octave_jumps(f0).tolist()[6:] == [75.0, 75.0, 75.0]
    # With it, the vowel is the reference and the noise is doubled toward it.
    assert fix_octave_jumps(f0, reference=reference).tolist() == [150.0] * 9


def test_voicing_mask_rejects_aperiodic_frames():
    f0 = np.array([0.0, 120.0, 120.0, 120.0])
    ap = np.array([[0.1, 0], [0.1, 0], [0.9, 0], [0.5, 0]])
    assert voicing_mask(f0, ap).tolist() == [False, True, False, False]


def test_analyse_does_not_voice_the_noise_onset(syllable_like: Wave):
    track = analyse(syllable_like, AnalysisParams())
    times_ms = track.times_s * 1000.0
    # Frames inside the 80 ms noise burst (200–280 ms) must be unvoiced.
    burst = (times_ms >= 205) & (times_ms <= 270)
    assert not np.any(track.f0[burst] > 0)
    assert track.trim_ms[0] < 210 and track.trim_ms[1] > 670


def test_normalised_contour_interpolates_across_unvoiced_gap():
    times = np.arange(0.0, 100.0, 10.0)
    f0 = np.array([100.0, 100.0, 0.0, 0.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0])
    contour = normalised_contour(f0, times, 0.0, 90.0, points=10)
    assert abs(contour[0] - 100.0) < 1e-6 and abs(contour[-1] - 200.0) < 1e-6
    # Log-domain interpolation: the midpoint of the gap sits at the geometric mean.
    assert abs(contour[2] - 100.0 * 2 ** (1 / 3)) < 0.5


def test_cli_batch_reports_per_clip_errors(tmp_path, syllable_like: Wave):
    wav = tmp_path / "ok.wav"
    write_wav(str(wav), syllable_like)
    job = {"version": 2, "clips": [{"id": "ok", "wav": str(wav)}, {"id": "missing", "wav": str(tmp_path / "nope.wav")}]}
    job_path = tmp_path / "job.json"
    job_path.write_text(json.dumps(job))
    out_path = tmp_path / "out.json"

    assert main(["features", str(job_path), "--out", str(out_path)]) == 0

    result = json.loads(out_path.read_text())
    assert result["version"] == FEATURES_VERSION
    assert set(result["clips"]) == {"ok"}
    assert "missing" in result["errors"]
    assert result["params"]["frame_ms"] == 5.0


def test_run_features_honours_params():
    x = np.concatenate([silence(50), tone(150.0, 300), silence(50)])
    wave = Wave(samples=x, sample_rate=SR)
    import tempfile, os
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "a.wav")
        write_wav(p, wave)
        r = run_features({"params": {"frameMs": 10.0}, "clips": [{"id": "a", "wav": p}]})
    assert r["params"]["frame_ms"] == 10.0
    assert abs(r["clips"]["a"]["f0"]["medianHz"] - 150.0) < 3.0
