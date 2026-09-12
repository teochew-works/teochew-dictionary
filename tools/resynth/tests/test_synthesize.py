from __future__ import annotations

import json

import numpy as np
import pytest

from resynth.audio import Wave, write_wav
from resynth.cli import main
from resynth.features import AnalysisParams, extract_features, fold_to_reference_octave
from resynth.synthesize import Target, UnvoicedClip, _resample_rows, render

from conftest import SR, noise, silence, tone

FALLING = [float(v) for v in np.linspace(190.0, 105.0, 20)]


def target(**overrides) -> Target:
    base = dict(contour_hz=FALLING, voiced_ms=400.0, onset_ms=None, rms_db=-12.5)
    base.update(overrides)
    return Target(**base)


def test_resample_rows_stretches_and_squeezes():
    rows = np.array([[0.0, 10.0], [2.0, 12.0], [4.0, 14.0]])
    assert _resample_rows(rows, 5).tolist() == [[0, 10], [1, 11], [2, 12], [3, 13], [4, 14]]
    assert _resample_rows(rows, 1).tolist() == [[0, 10]]
    assert _resample_rows(rows[:1], 3).tolist() == [[0, 10]] * 3
    assert len(_resample_rows(rows, 0)) == 0


def test_fold_to_reference_octave():
    f0 = np.array([0.0, 90.0, 92.0, 88.0])
    assert fold_to_reference_octave(f0, 180.0).tolist() == [0.0, 180.0, 184.0, 176.0]
    assert fold_to_reference_octave(f0 * 4, 180.0).tolist() == [0.0, 180.0, 184.0, 176.0]
    # Within an octave of the reference: untouched, even if some way off.
    assert fold_to_reference_octave(f0 * 1.5, 180.0).tolist() == (f0 * 1.5).tolist()


def test_render_follows_the_template_and_targets(syllable_like: Wave):
    out, info = render(syllable_like, AnalysisParams(), target())
    f = extract_features(out, AnalysisParams())

    # Structure: 50 ms pad either side of the rendered active region.
    assert info["activeStartMs"] == 50.0
    assert abs(f["trim"]["startMs"] - 50.0) <= 15.0
    assert abs(out.duration_ms - (100.0 + info["activeEndMs"] - 50.0)) < 1.0
    # Duration: the voiced span is the target, not the source's 400-ish.
    assert info["renderedVoicedMs"] == 400.0
    assert abs(f["voicedMs"] - 400.0) <= 30.0
    # Pitch: falls from ~190 to ~105 like the template, unlike the flat 150 Hz source.
    contour = f["f0"]["contour"]
    assert contour[2] > 170.0 and contour[-3] < 120.0
    assert contour[2] > contour[10] > contour[-3]
    # Level: on target, under the ceiling.
    assert abs(f["rmsDb"] - (-12.5)) <= 1.5
    assert f["peakDb"] <= -1.0
    assert info["gainDb"] != 0.0


def test_render_keeps_the_source_onset_when_no_target_is_given(syllable_like: Wave):
    _, info = render(syllable_like, AnalysisParams(), target(onset_ms=None))
    assert info["renderedOnsetMs"] == info["sourceOnsetMs"] > 0


def test_render_stretches_the_onset_to_its_target(syllable_like: Wave):
    _, info = render(syllable_like, AnalysisParams(), target(onset_ms=120.0))
    assert info["renderedOnsetMs"] == 120.0


def test_render_blend_keeps_some_of_the_clips_own_contour(syllable_like: Wave):
    full, _ = render(syllable_like, AnalysisParams(), target(f0_blend=1.0))
    half, _ = render(syllable_like, AnalysisParams(), target(f0_blend=0.5))
    c_full = extract_features(full, AnalysisParams())["f0"]["contour"]
    c_half = extract_features(half, AnalysisParams())["f0"]["contour"]
    # The source is flat at 150 Hz, so a half blend falls less steeply than the template.
    assert (c_half[2] - c_half[-3]) < (c_full[2] - c_full[-3])


def test_render_refuses_an_unvoiced_clip():
    x = np.concatenate([silence(50), noise(300, amp=0.2), silence(50)])
    with pytest.raises(UnvoicedClip):
        render(Wave(samples=x, sample_rate=SR), AnalysisParams(), target())


def test_render_folds_an_octave_low_source_to_the_templates_octave():
    # A 75 Hz source with a template around 150 Hz: the envelope must be
    # computed on the folded track, and the output must land on the template.
    x = np.concatenate([silence(100), tone(75.0, 400), silence(100)])
    out, info = render(Wave(samples=x, sample_rate=SR), AnalysisParams(), target(contour_hz=[150.0] * 20))
    f = extract_features(out, AnalysisParams())
    assert abs(f["f0"]["medianHz"] - 150.0) < 5.0


def test_cli_synthesize_writes_the_wav_and_reports_output_features(tmp_path, syllable_like: Wave):
    src = tmp_path / "src.wav"
    write_wav(str(src), syllable_like)
    out = tmp_path / "out.wav"
    job = {
        "clips": [
            {"id": "ok", "wav": str(src), "out": str(out), "target": {"contourHz": FALLING, "voicedMs": 400, "onsetMs": None, "rmsDb": -12.5}},
            {"id": "missing", "wav": str(tmp_path / "nope.wav"), "out": str(tmp_path / "nope-out.wav"), "target": {"contourHz": FALLING, "voicedMs": 400, "onsetMs": None, "rmsDb": -12.5}},
        ]
    }
    job_path = tmp_path / "job.json"
    job_path.write_text(json.dumps(job))
    result_path = tmp_path / "result.json"

    assert main(["synthesize", str(job_path), "--out", str(result_path)]) == 0

    result = json.loads(result_path.read_text())
    assert out.exists()
    assert result["clips"]["ok"]["out"] == str(out)
    assert result["clips"]["ok"]["features"]["f0"]["contour"] is not None
    assert result["clips"]["ok"]["info"]["renderedVoicedMs"] == 400.0
    assert "missing" in result["errors"]


def _ratio_db(a: np.ndarray, b: np.ndarray) -> float:
    return float(20 * np.log10(np.sqrt(np.mean(a**2)) / np.sqrt(np.mean(b**2))))


def test_render_keeps_the_onsets_level_relative_to_the_vowel(syllable_like: Wave):
    sr = syllable_like.sample_rate
    src_ratio = _ratio_db(syllable_like.samples[int(sr * 0.2) : int(sr * 0.28)], syllable_like.samples[int(sr * 0.3) : int(sr * 0.5)])

    out, info = render(syllable_like, AnalysisParams(), target())
    n_onset = int(sr * info["renderedOnsetMs"] / 1000.0)
    start = int(sr * info["activeStartMs"] / 1000.0)
    out_ratio = _ratio_db(out.samples[start : start + n_onset], out.samples[start + n_onset + int(sr * 0.02) : start + n_onset + int(sr * 0.2)])

    assert abs(out_ratio - src_ratio) < 1.5
    assert "onsetGainDb" in info
