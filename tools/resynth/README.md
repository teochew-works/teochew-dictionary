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
