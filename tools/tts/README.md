# teochew-tts

The ML half of issue #260: train a **phoneme-input VITS voice** ([Piper](https://github.com/OHF-Voice/piper1-gpl))
on the project's own single-speaker syllable corpus, and generate syllables from it. Everything
that is not model training — choosing which clips train, tokenising Peng'im and IPA, trimming and
padding the audio, grading what comes out — lives in `src/audio/` at the repo root
(`npm run tts:export`, `npm run audio:grade -- --dir=…`). This tool reads the dataset the exporter
writes and never has to know what a syllable is: every row's token ids are final.

It is a separate `uv` project from [`tools/resynth/`](../resynth/README.md) on purpose. That one
is three small DSP dependencies; this one pulls in PyTorch, Lightning and Piper, and nothing else
in the repository should pay for that.

> **Licence note.** `piper-tts` is GPL-3.0. It is a training-time tool run from this directory,
> like `ffmpeg`; no Piper code is linked into or shipped with the BSD-licensed project, and a
> trained voice's weights are the project's own. Keep it that way — do not import `piper` from
> anything outside `tools/tts/`.

## Governance (read before publishing anything)

[ADR-0027](../../docs/adrs/adr-0027.md) allows synthesis only as a labelled, derived tier of the
speaker's own recordings, and still forbids generating a syllable that has no recording. A VITS
voice **can** generate any syllable, which is exactly why nothing here publishes: `tts synth`
writes WAVs under `.cache/` for evaluation, and that is where they stay until an ADR says
otherwise. Model checkpoints stay out of git ([ADR-0014](../../docs/adrs/adr-0014.md)'s spirit), and
training stays out of `npm run check` ([ADR-0012](../../docs/adrs/adr-0012.md)).

## Running

```bash
# 1. At the repo root — once: cache clips + features, then export the dataset
npm run audio:grade
npm run tts:export                    # → .cache/audio-tts/chaozhou/{wavs, pengim, ipa, dataset.json}

# 2. Here
uv sync                               # pins Python 3.12; ~2 GB of wheels
uv run pytest                         # synthetic tests, no dataset needed

# a Piper "medium" checkpoint to warm-start the vocoder from (any language — only the
# text-agnostic decoder/posterior/flow weights are copied, never the phoneme embedding).
# This one's SHA-256 is already pinned in tts/checkpoints.py; any other must be pinned
# with --warmstart-sha256 before it will be loaded. See "Checkpoints are code" below.
curl -L -o ../../.cache/audio-tts/warmstart/en_US-lessac-medium.ckpt \
  'https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main/en/en_US/lessac/medium/epoch%3D2164-step%3D1355540.ckpt'

D=../../.cache/audio-tts
uv run tts train $D/chaozhou/pengim --run $D/runs/pengim --warmstart $D/warmstart/en_US-lessac-medium.ckpt --max-epochs 100
uv run tts train $D/chaozhou/ipa    --run $D/runs/ipa    --warmstart $D/warmstart/en_US-lessac-medium.ckpt --max-epochs 100

# generate the held-out syllables (never seen in training) from the best val_mel checkpoint
uv run tts synth $D/runs/pengim $D/chaozhou/pengim/holdout.csv --out $D/runs/pengim/holdout
uv run tts mos   $D/runs/pengim/holdout        # UTMOS, a no-reference predicted MOS

# 3. Back at the root: the same yardsticks audio:grade applies to the recordings
npm run audio:grade -- --dir=.cache/audio-tts/runs/pengim/holdout --z=1.5
```

`tts train` is a thin wrapper over `python -m piper.train fit`: it fixes the flags that follow
from the dataset layout (`--data.dataset_type phoneme_ids`, the phoneme map, `num_symbols`, the
sample rate, no VAD trim — the exporter already trimmed) and forwards anything after `--` to
Lightning, e.g. `-- --trainer.limit_train_batches=10` for a smoke run. `--accelerator auto`
picks CUDA or MPS. Measured on this corpus at batch 32: an RTX 4090 runs 2.45 steps/s alone and
1.86 with both A/B runs sharing it (~45 s/epoch, so 100 epochs of both schemes is ~75 min); an
M5 Max on MPS manages 0.94 and 0.46 (~3 min/epoch, ~5 h). `--resume` continues from the run's
`last.ckpt`.

## What the dataset is

See `tts/dataset.py`. Per variety: `wavs/<key>.wav` (one trimmed, 50 ms-padded, 22.05 kHz float
clip per recording that `audio:grade` would not flag at 3σ), and per token scheme a
`metadata.csv` (`file|text|ids`), a `holdout.csv` in the same format for the ~5% of syllables kept
out of training, and `phonemes.json`, Piper's `phoneme_id_map`. Two schemes are exported from the
same audio, because which to train on is the A/B the issue asks for:

| scheme   | `cên1` becomes         | symbols |
|----------|------------------------|---------|
| `pengim` | `c ê n 1`              | 31      |
| `ipa`    | `t s ʰ ẽ T1`           | 42      |

**Train on `pengim`.** It beat `ipa` on every measurement at every checkpoint
(issue #260 — the numbers are in [TTS.md §4a](../../data/phonology/TTS.md)),
most likely because this project's IPA is a deterministic function of the
Peng'im and so carries no extra information, only a larger inventory. Also
generate with **`--length-scale 1.3`**: at the default 1.0 the duration
predictor lands ~1.8σ short of the corpus, and correcting that roughly
doubles how many clips pass the σ-grading. `ipa` needs 1.45. Compare only
after correcting, or the bias decides the comparison.

## Listening to what it made

The numbers this tool reports — UTMOS, and the σ-grading at the repo root — cannot hear whether a
syllable sounds right, or is even the right syllable. `web/`'s dev-only **A/B** tab is where a
person supplies that: `cd web && npm run dev`, pick a set, and judge generated against recorded
blind. See [web/README.md § Dev-only tools](../../web/README.md#dev-only-tools). Verdicts land in
`.cache/audio-tts/review.json`.

## Checkpoints are code

A `.ckpt` is a pickle. Piper reads a warm-start file with
`torch.load(..., weights_only=False)`, and `load_from_checkpoint` additionally imports and calls
module names taken from the checkpoint's own hyperparameters — CVE-2026-58659 in `lightning`,
**unfixed as of 2.6.6, the current release** (the advisory's "fixed in 2022.6.15" is a 2022
date-stamped version that merely sorts higher). Loading a downloaded checkpoint is therefore
equivalent to running an unsigned binary, with or without that CVE.

So `tts train` refuses a `--warmstart` file whose SHA-256 it does not recognise — the same rule
[ADR-0014](../../docs/adrs/adr-0014.md) applies to audio bytes, where a URL is never trusted and
its checksum is. Pin a new one with `--warmstart-sha256=<digest>`, or `--allow-unpinned-warmstart`
to skip the check deliberately; add it to `KNOWN_CHECKPOINTS` in `tts/checkpoints.py` if it should
be a standing choice. `tts synth` loads only checkpoints a local `tts train` produced.

`osv-scanner.toml` records the accepted finding and its review date.

## The NumPy alignment search

Piper aligns tokens to frames with a Cython dynamic programme that its macOS wheel does not
ship (neither the compiled module nor the `.pyx`). `tts/monotonic_align.py` is the same
algorithm in NumPy — for a ~5-token, ~50-frame syllable the difference is immaterial — and
`install()` registers it under the names Piper imports only when the compiled one is absent.
`tests/test_monotonic_align.py` checks it against an exhaustive search.
