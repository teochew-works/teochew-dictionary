"""`tts train|synth|mos …` — the ML half of issue #260.

Thin on purpose: Piper's own `LightningCLI` does the training, and this
wrapper only fixes the flags that follow from how `npm run tts:export` laid
the dataset out (phoneme ids in the CSV, no VAD trim, the sample rate from
`dataset.json`), so a run is one command rather than fifteen flags copied
from a README. Anything after `--` goes to Lightning untouched.
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
from pathlib import Path

from .dataset import Row, SchemeDir, read_rows

_LOGGER = logging.getLogger("tts")


def _train(args: argparse.Namespace, passthrough: list[str]) -> int:
    from .monotonic_align import install

    backend = install()
    _LOGGER.info("monotonic alignment: %s", backend)

    ds = SchemeDir(Path(args.dataset).resolve())
    ds.validate()
    run = Path(args.run).resolve()
    run.mkdir(parents=True, exist_ok=True)
    report = ds.report()

    argv = [
        "fit",
        f"--data.voice_name={report['variety']}-{ds.scheme}",
        f"--data.csv_path={ds.metadata_csv}",
        f"--data.audio_dir={ds.wavs_dir}",
        f"--data.cache_dir={run / 'cache'}",
        f"--data.config_path={run / 'config.json'}",
        "--data.dataset_type=phoneme_ids",
        "--data.phoneme_type=text",
        # Required by Piper's CLI even though nothing here is phonemised by espeak.
        "--data.espeak_voice=none",
        f"--data.phonemes_path={ds.phonemes_json}",
        f"--data.num_symbols={ds.num_symbols()}",
        "--data.trim_silence=false",
        f"--data.batch_size={args.batch_size}",
        f"--data.validation_split={args.validation_split}",
        f"--data.num_workers={args.workers}",
        f"--model.sample_rate={ds.sample_rate()}",
        f"--trainer.accelerator={args.accelerator}",
        f"--trainer.max_epochs={args.max_epochs}",
        f"--trainer.default_root_dir={run}",
        f"--trainer.check_val_every_n_epoch={args.val_every}",
        "--trainer.log_every_n_steps=10",
    ]
    if args.warmstart:
        argv.append(f"--model.vocoder_warmstart_ckpt={Path(args.warmstart).resolve()}")
    if args.resume:
        last = _last_checkpoint(run)
        if last is None:
            _LOGGER.error("--resume: no last.ckpt under %s", run)
            return 1
        argv.append(f"--ckpt_path={last}")
    argv.extend(passthrough)

    _LOGGER.info("piper.train %s", " ".join(argv))
    from piper.train.__main__ import main as piper_main

    sys.argv = ["piper.train", *argv]
    piper_main()
    return 0


def _last_checkpoint(run: Path) -> Path | None:
    candidates = sorted(run.glob("lightning_logs/version_*/checkpoints/last.ckpt"), key=lambda p: p.stat().st_mtime)
    return candidates[-1] if candidates else None


def _best_checkpoint(run: Path) -> Path | None:
    """The newest run's lowest `val_mel` checkpoint, else its last."""
    versions = sorted(run.glob("lightning_logs/version_*"), key=lambda p: p.stat().st_mtime)
    if not versions:
        return None
    ckpts = list((versions[-1] / "checkpoints").glob("epoch=*-val_mel=*.ckpt"))
    if ckpts:
        return min(ckpts, key=lambda p: float(p.stem.rsplit("val_mel=", 1)[1]))
    return _last_checkpoint(run)


def _synth(args: argparse.Namespace) -> int:
    import numpy as np
    import soundfile as sf
    import torch

    from .monotonic_align import install

    install()
    from piper.train.vits.lightning import VitsModel

    run = Path(args.run).resolve()
    checkpoint = Path(args.checkpoint).resolve() if args.checkpoint else _best_checkpoint(run)
    if checkpoint is None or not checkpoint.exists():
        _LOGGER.error("no checkpoint under %s (train first, or pass --checkpoint)", run)
        return 1
    with open(run / "config.json", encoding="utf-8") as f:
        config = json.load(f)
    sample_rate = int(config["audio"]["sample_rate"])

    rows: list[Row] = []
    for csv_path in args.csv:
        rows.extend(read_rows(Path(csv_path)))
    if args.keys:
        wanted = set(args.keys.split(","))
        rows = [r for r in rows if r.key in wanted]
    if not rows:
        _LOGGER.error("nothing to synthesise")
        return 1

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    _LOGGER.info("checkpoint %s → %d clip(s) into %s", checkpoint, len(rows), out)

    model = VitsModel.load_from_checkpoint(str(checkpoint), map_location="cpu")
    model.eval()
    with torch.no_grad():
        model.model_g.dec.remove_weight_norm()

    scales = [args.noise_scale, args.length_scale, args.noise_w]
    manifest: dict[str, dict] = {}
    with torch.no_grad():
        for row in rows:
            ids = torch.LongTensor(row.ids).unsqueeze(0)
            audio = model(ids, torch.LongTensor([len(row.ids)]), scales).detach().numpy().reshape(-1)
            peak = float(np.max(np.abs(audio))) if audio.size else 0.0
            if peak > 1.0:
                audio = audio / peak
            wav = out / f"{row.key}.wav"
            sf.write(wav, audio.astype(np.float32), sample_rate, subtype="PCM_16")
            manifest[row.key] = {"wav": str(wav), "text": row.text, "ms": round(1000 * audio.size / sample_rate)}

    with open(out / "synth.json", "w", encoding="utf-8") as f:
        json.dump(
            {"checkpoint": str(checkpoint), "sampleRate": sample_rate, "scales": scales, "clips": manifest},
            f,
            ensure_ascii=False,
            indent=2,
        )
    return 0


def _mos(args: argparse.Namespace) -> int:
    import soundfile as sf
    import torch

    files: list[Path] = []
    for p in args.paths:
        path = Path(p)
        if not path.exists():
            _LOGGER.error("no such file or directory: %s", path)
            return 1
        files.extend(sorted(path.glob("*.wav")) if path.is_dir() else [path])
    if not files:
        _LOGGER.error("no WAV files")
        return 1

    predictor = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)
    predictor.eval()
    scores: dict[str, float] = {}
    with torch.inference_mode():
        for path in files:
            audio, sr = sf.read(path, dtype="float32", always_2d=True)
            wave = torch.from_numpy(audio[:, 0]).unsqueeze(0)
            scores[path.stem] = float(predictor(wave, sr).mean().item())

    values = list(scores.values())
    summary = {
        "n": len(values),
        "mean": round(statistics.fmean(values), 3),
        "median": round(statistics.median(values), 3),
        "stdev": round(statistics.pstdev(values), 3) if len(values) > 1 else 0.0,
        "min": round(min(values), 3),
        "max": round(max(values), 3),
    }
    result = {"summary": summary, "scores": {k: round(v, 3) for k, v in scores.items()}}
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(json.dumps(summary))
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    raw = list(sys.argv[1:] if argv is None else argv)
    passthrough: list[str] = []
    if "--" in raw:
        idx = raw.index("--")
        raw, passthrough = raw[:idx], raw[idx + 1 :]

    parser = argparse.ArgumentParser(prog="tts")
    sub = parser.add_subparsers(dest="command", required=True)

    train = sub.add_parser("train", help="train a Piper (VITS) voice on one exported token scheme")
    train.add_argument("dataset", help="<variety>/<scheme> directory written by `npm run tts:export`")
    train.add_argument("--run", required=True, help="where checkpoints, logs and config.json go")
    train.add_argument("--warmstart", help="Piper medium checkpoint to copy the vocoder from")
    train.add_argument("--accelerator", default="auto", help="Lightning accelerator: auto, mps, cpu, gpu")
    train.add_argument("--batch-size", type=int, default=32)
    train.add_argument("--max-epochs", type=int, default=-1, help="-1 trains until interrupted")
    train.add_argument("--val-every", type=int, default=5, help="validate every N epochs")
    train.add_argument("--validation-split", type=float, default=0.05)
    train.add_argument("--workers", type=int, default=4)
    train.add_argument("--resume", action="store_true", help="continue from the run's last.ckpt")

    synth = sub.add_parser("synth", help="generate one WAV per CSV row from a trained run")
    synth.add_argument("run", help="the --run directory of a training run")
    synth.add_argument("csv", nargs="+", help="metadata.csv / holdout.csv rows to synthesise")
    synth.add_argument("--out", required=True)
    synth.add_argument("--checkpoint", help="default: the run's best val_mel checkpoint")
    synth.add_argument("--keys", help="comma-separated syllables to keep")
    synth.add_argument("--noise-scale", type=float, default=0.667)
    synth.add_argument("--length-scale", type=float, default=1.0)
    synth.add_argument("--noise-w", type=float, default=0.8)

    mos = sub.add_parser("mos", help="UTMOS (predicted MOS) for WAV files or directories")
    mos.add_argument("paths", nargs="+")
    mos.add_argument("--out", help="write per-file scores here as JSON")

    args = parser.parse_args(raw)
    if args.command == "train":
        return _train(args, passthrough)
    if args.command == "synth":
        return _synth(args)
    if args.command == "mos":
        return _mos(args)
    parser.error(f"unknown command {args.command}")  # pragma: no cover
    return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
