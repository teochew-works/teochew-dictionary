from __future__ import annotations

import json
from pathlib import Path

import pytest

from tts.dataset import SchemeDir, read_rows


def _write_dataset(root: Path) -> SchemeDir:
    (root / "wavs").mkdir()
    scheme = root / "pengim"
    scheme.mkdir()
    (scheme / "metadata.csv").write_text("du2.wav|d u 2|1 0 6 0 7 0 4 0 2\ndu2~1.wav|d u 2|1 0 6 0 7 0 4 0 2\n", encoding="utf-8")
    (scheme / "phonemes.json").write_text(json.dumps({"_": [0], "^": [1], "$": [2], "2": [4], "d": [6], "u": [7]}), encoding="utf-8")
    (root / "dataset.json").write_text(json.dumps({"variety": "chaozhou", "params": {"sampleRate": 22050}}), encoding="utf-8")
    return SchemeDir(scheme)


def test_rows_carry_final_ids_and_the_syllable_from_the_filename(tmp_path: Path) -> None:
    ds = _write_dataset(tmp_path)
    rows = read_rows(ds.metadata_csv)
    assert [r.key for r in rows] == ["du2", "du2"]
    assert rows[0].file == "du2.wav" and rows[1].file == "du2~1.wav"
    assert rows[0].text == "d u 2"
    assert rows[0].ids == [1, 0, 6, 0, 7, 0, 4, 0, 2]


def test_scheme_dir_reads_the_variety_level_files(tmp_path: Path) -> None:
    ds = _write_dataset(tmp_path)
    ds.validate()
    assert ds.scheme == "pengim"
    assert ds.wavs_dir == tmp_path / "wavs"
    assert ds.sample_rate() == 22050
    assert ds.num_symbols() == 8  # highest id + 1, not the count of symbols


def test_validate_names_what_is_missing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="tts:export"):
        SchemeDir(tmp_path / "ipa").validate()
