from __future__ import annotations

import json

import numpy as np

from resynth import MFCC_VERSION
from resynth.audio import Wave, active_bounds_ms, write_wav
from resynth.cli import main, run_mfcc
from resynth.mfcc import MfccParams, extract_mfcc

from conftest import SR, silence, tone


def test_frame_count_matches_hop_arithmetic(syllable_like: Wave):
    params = MfccParams()
    frames = extract_mfcc(syllable_like, params)

    start_ms, end_ms = active_bounds_ms(syllable_like.samples, SR, params.silence_db)
    active_samples = int(round(end_ms * SR / 1000.0)) - int(start_ms * SR / 1000.0)
    frame_len = round(SR * params.frame_ms / 1000.0)
    hop_len = round(SR * params.hop_ms / 1000.0)
    expected = 1 + (active_samples - frame_len) // hop_len

    assert len(frames) == expected


def test_output_shape_is_frames_by_n_mfcc(syllable_like: Wave):
    params = MfccParams(n_mfcc=13)
    frames = extract_mfcc(syllable_like, params)
    assert len(frames) > 0
    assert all(len(f) == params.n_mfcc for f in frames)


def test_short_clip_yields_one_frame_not_a_crash():
    x = tone(150.0, 10.0)
    frames = extract_mfcc(Wave(samples=x, sample_rate=SR), MfccParams())
    assert len(frames) == 1


def test_silent_clip_does_not_crash():
    x = silence(300)
    frames = extract_mfcc(Wave(samples=x, sample_rate=SR), MfccParams())
    assert len(frames) > 0
    assert all(np.isfinite(v) for frame in frames for v in frame)


def test_active_region_is_trimmed_before_framing():
    params = MfccParams()
    plain = np.concatenate([silence(50), tone(150.0, 400), silence(50)])
    padded = np.concatenate([silence(300), tone(150.0, 400), silence(50)])

    plain_frames = extract_mfcc(Wave(samples=plain, sample_rate=SR), params)
    padded_frames = extract_mfcc(Wave(samples=padded, sample_rate=SR), params)

    # Trimming should erase the extra 250ms of leading silence, leaving
    # frame counts within a hop or two of each other rather than differing
    # by the ~25 extra 10ms-hop frames an untrimmed 250ms pad would add.
    assert abs(len(plain_frames) - len(padded_frames)) <= 2


def test_octave_apart_tones_separate_in_the_low_mel_bins():
    params = MfccParams()
    low = extract_mfcc(Wave(samples=tone(150.0, 300), sample_rate=SR), params)
    low_again = extract_mfcc(Wave(samples=tone(150.0, 300), sample_rate=SR), params)
    high = extract_mfcc(Wave(samples=tone(300.0, 300), sample_rate=SR), params)

    def mean_dist(a: list[list[float]], b: list[list[float]]) -> float:
        n = min(len(a), len(b))
        return float(np.mean([np.linalg.norm(np.array(a[i]) - np.array(b[i])) for i in range(n)]))

    # An identical re-synthesis of the same tone should land much closer than
    # a tone an octave up — the whole point of MFCC discriminating spectral
    # content rather than just overall loudness.
    same_tone_dist = mean_dist(low, low_again)
    cross_tone_dist = mean_dist(low, high)
    assert same_tone_dist < 1e-6
    assert cross_tone_dist > same_tone_dist


def test_cli_batch_reports_per_clip_errors(tmp_path, syllable_like: Wave):
    wav = tmp_path / "ok.wav"
    write_wav(str(wav), syllable_like)
    job = {"clips": [{"id": "ok", "wav": str(wav)}, {"id": "missing", "wav": str(tmp_path / "nope.wav")}]}
    job_path = tmp_path / "job.json"
    job_path.write_text(json.dumps(job))
    out_path = tmp_path / "out.json"

    assert main(["mfcc", str(job_path), "--out", str(out_path)]) == 0

    result = json.loads(out_path.read_text())
    assert result["version"] == MFCC_VERSION
    assert set(result["clips"]) == {"ok"}
    assert "missing" in result["errors"]
    assert result["params"]["n_mfcc"] == 13


def test_run_mfcc_honours_params():
    x = np.concatenate([silence(50), tone(150.0, 300), silence(50)])
    wave = Wave(samples=x, sample_rate=SR)
    import os
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "a.wav")
        write_wav(p, wave)
        r = run_mfcc({"params": {"nMfcc": 8}, "clips": [{"id": "a", "wav": p}]})
    assert r["params"]["n_mfcc"] == 8
    assert all(len(frame) == 8 for frame in r["clips"]["a"])
