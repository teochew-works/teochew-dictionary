"""WORLD-vocoder analysis and resynthesis of the project's own syllable clips.

Python is confined to this package on purpose: the rest of the repo is
TypeScript, and only the numerical DSP (f0 tracking, spectral envelope,
resynthesis) lacks a mature Node implementation. `src/audio/` at the repo root
owns everything else — the manifest, the clip cache, ffmpeg transcodes, the
per-part statistics — and drives this tool through one JSON job per batch, the
same way it shells out to `ffmpeg` and `afconvert`.
"""

FEATURES_VERSION = 2
