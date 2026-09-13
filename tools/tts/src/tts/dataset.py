"""The dataset `npm run tts:export` writes, as this tool reads it.

Layout, per variety (`.cache/audio-tts/<variety>/`):

    dataset.json            what was kept, dropped and held out; the WAV params
    wavs/<key>.wav          one trimmed, padded clip per recording
    <scheme>/metadata.csv   `file|text|ids` — the training rows (Piper's `phoneme_ids` format)
    <scheme>/holdout.csv    the same, for syllables kept out of training
    <scheme>/phonemes.json  Piper's `phoneme_id_map`: symbol → [id]

Tokenisation happens on the TypeScript side, once, so nothing here has to
know Peng'im or IPA: a row's ids are final.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Row:
    file: str
    text: str
    ids: list[int]

    @property
    def key(self) -> str:
        """The syllable, from the WAV name (`du2.wav`, or `du2~1.wav` for a second take)."""
        return Path(self.file).stem.split("~", 1)[0]


def read_rows(csv_path: Path) -> list[Row]:
    with open(csv_path, encoding="utf-8", newline="") as f:
        return [Row(row[0], row[1], [int(i) for i in row[2].split()]) for row in csv.reader(f, delimiter="|") if row]


@dataclass(frozen=True)
class SchemeDir:
    """One `<variety>/<scheme>/` directory and the variety-level files beside it."""

    path: Path

    @property
    def scheme(self) -> str:
        return self.path.name

    @property
    def variety_dir(self) -> Path:
        return self.path.parent

    @property
    def wavs_dir(self) -> Path:
        return self.variety_dir / "wavs"

    @property
    def metadata_csv(self) -> Path:
        return self.path / "metadata.csv"

    @property
    def holdout_csv(self) -> Path:
        return self.path / "holdout.csv"

    @property
    def phonemes_json(self) -> Path:
        return self.path / "phonemes.json"

    def report(self) -> dict:
        with open(self.variety_dir / "dataset.json", encoding="utf-8") as f:
            return json.load(f)

    def sample_rate(self) -> int:
        return int(self.report()["params"]["sampleRate"])

    def num_symbols(self) -> int:
        with open(self.phonemes_json, encoding="utf-8") as f:
            ids = [i for v in json.load(f).values() for i in v]
        return max(ids) + 1

    def validate(self) -> None:
        for p in (self.metadata_csv, self.phonemes_json, self.variety_dir / "dataset.json", self.wavs_dir):
            if not p.exists():
                raise FileNotFoundError(f"{p} — run `npm run tts:export` at the repo root first")
