"""`resynth features <job.json> [--out <result.json>]`

One process per batch, not per clip: the corpus is ~3,000 clips and WORLD
analysis is ~0.15 s each, so interpreter start-up per clip would dominate.
The job lists WAV paths — the TypeScript side owns the webm→wav hop (ffmpeg),
exactly as `src/importers/caf-encode.ts` does — and the result is keyed by
the job's own clip ids so the caller never has to match by path.

Per-clip failures are reported under `errors` rather than aborting the batch:
one unreadable file shouldn't cost a seven-minute run.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import FEATURES_VERSION
from .audio import read_wav
from .features import AnalysisParams, extract_features, params_as_json


def run_features(job: dict) -> dict:
    params = AnalysisParams.from_json(job.get("params"))
    clips: dict[str, dict] = {}
    errors: dict[str, str] = {}
    for clip in job.get("clips", []):
        clip_id = clip["id"]
        try:
            clips[clip_id] = extract_features(read_wav(clip["wav"]), params)
        except Exception as e:  # noqa: BLE001 — reported per clip, by design
            errors[clip_id] = f"{type(e).__name__}: {e}"
    return {"version": FEATURES_VERSION, "params": params_as_json(params), "clips": clips, "errors": errors}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resynth")
    sub = parser.add_subparsers(dest="command", required=True)

    features = sub.add_parser("features", help="extract per-clip features for a batch of WAV files")
    features.add_argument("job", help="path to the JSON job file")
    features.add_argument("--out", help="write the JSON result here instead of stdout")

    args = parser.parse_args(argv)

    with open(args.job, encoding="utf-8") as f:
        job = json.load(f)

    if args.command == "features":
        result = run_features(job)
    else:  # pragma: no cover — argparse rejects unknown subcommands
        parser.error(f"unknown command {args.command}")
        return 2

    text = json.dumps(result, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
