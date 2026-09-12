"""`resynth features|synthesize <job.json> [--out <result.json>]`

One process per batch, not per clip: the corpus is ~3,000 clips and WORLD
analysis is ~0.15 s each, so interpreter start-up per clip would dominate.
Within a batch, clips are independent and WORLD is single-threaded, so they
are spread over a worker pool (`--jobs`, default: every core).
The job lists WAV paths — the TypeScript side owns the webm→wav hop (ffmpeg),
exactly as `src/importers/caf-encode.ts` does — and the result is keyed by
the job's own clip ids so the caller never has to match by path.

Per-clip failures are reported under `errors` rather than aborting the batch:
one unreadable file shouldn't cost a seven-minute run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from multiprocessing import Pool

from . import FEATURES_VERSION
from .audio import read_wav
from .audio import write_wav
from .features import AnalysisParams, extract_features, params_as_json
from .synthesize import Target, render


def _features_one(args: tuple[dict, AnalysisParams]) -> tuple[str, dict | None, str | None]:
    clip, params = args
    try:
        return clip["id"], extract_features(read_wav(clip["wav"]), params), None
    except Exception as e:  # noqa: BLE001 — reported per clip, by design
        return clip["id"], None, f"{type(e).__name__}: {e}"


def _synthesize_one(args: tuple[dict, AnalysisParams]) -> tuple[str, dict | None, str | None]:
    clip, params = args
    try:
        rendered, info = render(read_wav(clip["wav"]), params, Target.from_json(clip["target"]))
        write_wav(clip["out"], rendered)
        # Measured within the region the render placed, not re-detected — see `analyse`.
        features = extract_features(rendered, params, active_ms=(info["activeStartMs"], info["activeEndMs"]))
        return clip["id"], {"out": clip["out"], "info": info, "features": features}, None
    except Exception as e:  # noqa: BLE001 — reported per clip, by design
        return clip["id"], None, f"{type(e).__name__}: {e}"


def _run(job: dict, worker, jobs: int | None) -> dict:
    params = AnalysisParams.from_json(job.get("params"))
    work = [(clip, params) for clip in job.get("clips", [])]
    clips: dict[str, dict] = {}
    errors: dict[str, str] = {}

    def collect(results) -> None:
        for clip_id, result, error in results:
            if error is not None:
                errors[clip_id] = error
            else:
                clips[clip_id] = result

    processes = min(max(1, jobs or os.cpu_count() or 1), max(1, len(work)))
    if processes == 1:
        collect(map(worker, work))
    else:
        with Pool(processes=processes) as pool:
            collect(pool.imap_unordered(worker, work))
    return {"version": FEATURES_VERSION, "params": params_as_json(params), "clips": clips, "errors": errors}


def run_features(job: dict, jobs: int | None = None) -> dict:
    return _run(job, _features_one, jobs)


def run_synthesize(job: dict, jobs: int | None = None) -> dict:
    """Each clip: `{id, wav, out, target}` → renders `out` and reports the
    output's own features (measured by the same extractor grading uses, so
    the caller's self-check is against the same numbers)."""
    return _run(job, _synthesize_one, jobs)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resynth")
    sub = parser.add_subparsers(dest="command", required=True)

    features = sub.add_parser("features", help="extract per-clip features for a batch of WAV files")
    features.add_argument("job", help="path to the JSON job file")
    features.add_argument("--out", help="write the JSON result here instead of stdout")
    features.add_argument("--jobs", type=int, help="worker processes (default: every core)")

    synth = sub.add_parser("synthesize", help="re-render a batch of WAV files toward per-clip targets")
    synth.add_argument("job", help="path to the JSON job file")
    synth.add_argument("--out", help="write the JSON result here instead of stdout")
    synth.add_argument("--jobs", type=int, help="worker processes (default: every core)")

    args = parser.parse_args(argv)

    with open(args.job, encoding="utf-8") as f:
        job = json.load(f)

    if args.command == "features":
        result = run_features(job, args.jobs)
    elif args.command == "synthesize":
        result = run_synthesize(job, args.jobs)
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
