# teochew-resynth

The numerical half of `npm run audio:grade` / `npm run audio:synthesize` (issue #259): WORLD-vocoder
analysis of the project's own syllable clips, and — later — resynthesis of them toward per-part
targets. Everything that is not DSP (the manifest, the clip cache, ffmpeg transcodes, the per-tone
statistics, publishing) lives in `src/audio/` at the repo root and drives this tool through one JSON
job per batch, the way the root already shells out to `ffmpeg` and `afconvert`.

This is the only Python in the repository, on purpose: `pyworld` has no Node equivalent. Keep it
that way — logic that isn't signal processing belongs in TypeScript.

## Running

```bash
uv sync                          # once; pins Python 3.12 via .python-version
uv run resynth features job.json --out result.json
uv run resynth synthesize job.json --out result.json   # both take --jobs N (default: every core)
uv run pytest                    # synthetic-signal tests, no fixtures on disk
```

The root CLIs invoke `uv run --project tools/resynth resynth …` themselves. `npm run check` never
runs this — it stays offline and Node-only (ADR-0012); the Python tests are their own CI job.

## Job / result shape (`features`)

```jsonc
// job
{ "params": { "frameMs": 5, "f0FloorHz": 60, "f0CeilHz": 400, "silenceDb": -30 },
  "clips": [ { "id": "<sha256>", "wav": "/abs/path.wav" } ] }
// result
{ "version": 2, "params": { … }, "clips": { "<sha256>": { …features } }, "errors": { "<sha256>": "why" } }
```

Voicing is decided by WORLD's own aperiodicity, not by the f0 tracker alone — `harvest` confidently
"voices" a fricative onset or the room noise in leading silence at 60–90 Hz, and taking that at face
value both hid every /s/ onset and folded genuine vowel frames down an octave. The per-clip octave
fold takes its reference from the active region only for the same reason.

A clip's features: `totalMs`, `sampleRate`, `trim {startMs,endMs}`, `activeMs`, `rmsDb`, `peakDb`,
`onsetMs` (unvoiced onset before the first voiced frame — a voiceless initial), `voicedMs`,
`voicedRatio`, and `f0 {medianHz,startHz,endHz,contour[20]}` — the contour is time-normalised over
the voiced span, so contours of a 300 ms checked syllable and a 700 ms open one are comparable
point-for-point.

## Job / result shape (`synthesize`)

```jsonc
// job: as above, plus per clip an output path and a target
{ "params": { … },
  "clips": [ { "id": "du2", "wav": "/abs/src.wav", "out": "/abs/du2.wav",
               "target": { "contourHz": [20 values], "voicedMs": 445, "onsetMs": null, "rmsDb": -12.5,
                           "peakCeilingDb": -1, "padMs": 50, "fadeMs": 5, "f0Blend": 1 } } ] }
// result
{ "version": 2, "clips": { "du2": { "out": "…", "info": { …what was done }, "features": { …of the output } } },
  "errors": { … } }
```

The output's features are measured *within the active region the render placed* (`activeStartMs`/
`activeEndMs`), not re-detected at the absolute silence bound: a render sits several dB below the
originals, and re-detecting would clip a quiet /s/ or nasal coda out of the measurement.

`render()` keeps the clip's own WORLD spectral envelope and aperiodicity and replaces only what
varies between takes: the f0 across the voiced span becomes the target contour (folded to the
target's octave *before* the envelope is computed, since cheaptrick sizes its window from f0), the
unvoiced onset and voiced span are time-warped to their target lengths, the unvoiced onset and tail
keep their level *relative to the vowel* (WORLD re-renders noise-excited frames markedly quieter,
which is audible as a weak sibilant), the whole is set by RMS under a peak ceiling, and the result
gets 5 ms edge fades and a fixed pad of silence. The output's
features are measured by the same extractor `features` uses, so the caller's self-check is against
the same numbers the targets came from.
