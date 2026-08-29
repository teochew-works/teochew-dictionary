/**
 * Client-side synthesis of a single "play all" clip from a reading's
 * per-syllable recordings (issue #191): fetch + decode each clip, trim the
 * leading/trailing silence every clip carries, then crossfade-concatenate
 * them into one buffer. Only called once a reading has already passed
 * `canCombine` (search/filters.ts) — a full, same-speaker set of clips — so
 * a fetch/decode failure here is an edge case (e.g. a retagged release
 * asset), not the common path.
 */

/** RMS threshold a window must clear to count as "not silence". Tunable — see the issue's own note that this needs testing against the real clip set. */
export const SILENCE_RMS_THRESHOLD = 0.02

/** Crossfade length at each seam: short enough not to blur two syllables together, long enough to avoid an audible click. */
export const CROSSFADE_MS = 25

/**
 * Where a clip's real signal starts/ends, found by scanning in
 * `windowSize`-sample steps (not sample-by-sample — that's noisy on quiet
 * consonant onsets/breathy starts) until a window's RMS clears `threshold`.
 * Degrades to the untrimmed bounds, never a zero-length or out-of-range
 * result, when no window ever clears it (a mis-tuned threshold or a
 * genuinely silent clip should mean "don't trim", not "produce nothing").
 */
export function trimSilence(
  samples: Float32Array,
  threshold: number = SILENCE_RMS_THRESHOLD,
  windowSize = 512,
): { start: number; end: number } {
  if (samples.length === 0) return { start: 0, end: 0 }

  function rms(from: number, to: number): number {
    let sumSquares = 0
    for (let i = from; i < to; i++) sumSquares += samples[i]! * samples[i]!
    return Math.sqrt(sumSquares / (to - from))
  }

  let start = 0
  while (start < samples.length) {
    if (rms(start, Math.min(start + windowSize, samples.length)) >= threshold) break
    start += windowSize
  }

  let end = samples.length
  while (end > start) {
    if (rms(Math.max(end - windowSize, start), end) >= threshold) break
    end -= windowSize
  }

  if (start >= end) return { start: 0, end: samples.length }
  return { start, end }
}

/**
 * Concatenates already-trimmed clips into one buffer, blending a linear
 * crossfade across each seam rather than a hard cut — the two clips'
 * fade-out/fade-in weights always sum to 1, so a seam between two
 * full-amplitude clips stays full amplitude rather than doubling. Each
 * seam's length is independently clamped to the shorter of its two
 * neighbours, so a clip trimmed down to less than the configured crossfade
 * can't push a read/write out of bounds.
 */
export function concatenateWithCrossfade(
  clips: Float32Array[],
  sampleRate: number,
  crossfadeMs: number = CROSSFADE_MS,
): Float32Array {
  if (clips.length === 0) return new Float32Array(0)
  if (clips.length === 1) return clips[0]!

  const configuredCrossfadeSamples = Math.max(0, Math.round((crossfadeMs / 1000) * sampleRate))
  const seams = clips.slice(0, -1).map((clip, i) => Math.min(configuredCrossfadeSamples, clip.length, clips[i + 1]!.length))

  const totalLength = clips.reduce((sum, c) => sum + c.length, 0) - seams.reduce((sum, n) => sum + n, 0)
  const result = new Float32Array(totalLength)

  let cursor = 0
  for (const [i, clip] of clips.entries()) {
    if (i === 0) {
      result.set(clip, 0)
      cursor = clip.length
      continue
    }
    const seam = seams[i - 1]!
    const overlapStart = cursor - seam
    for (let s = 0; s < seam; s++) {
      const fadeIn = (s + 1) / (seam + 1)
      result[overlapStart + s] = result[overlapStart + s]! * (1 - fadeIn) + clip[s]! * fadeIn
    }
    result.set(clip.subarray(seam), cursor)
    cursor = cursor - seam + clip.length
  }

  return result
}

/** Averages every channel down to one — crossfade math is simplest on mono, and these are spoken-word clips where stereo carries no meaningful signal. */
function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const mono = new Float32Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]!
    mono[i] = sum / channels.length
  }
  return mono
}

/**
 * `decodeAudioData` decodes each file at its own native sample rate, not the
 * `AudioContext`'s — and these clips are pooled from multiple sources
 * (native recordings, Lingua Libre imports) over time, so rates can differ.
 * Rendering through an `OfflineAudioContext` is the standard way to resample
 * a decoded buffer since there's no direct buffer-to-buffer resample API.
 */
async function resampleTo(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) return buffer
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(buffer.duration * targetSampleRate),
    targetSampleRate,
  )
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  return offline.startRendering()
}

/**
 * One lazily-created, module-level `AudioContext` — mirrors
 * `useAudioPlayer.ts`'s lazy shared `HTMLAudioElement` — rather than one per
 * call, since browsers cap the number of *live* contexts.
 */
let sharedContext: AudioContext | null = null
export function getAudioContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext()
  return sharedContext
}

/**
 * Fetches, decodes, resamples to one common rate, trims, and
 * crossfade-concatenates a reading's clips into a single playable buffer.
 * Any one clip failing to fetch/decode rejects the whole thing — there's no
 * sensible partial result for a reading missing one syllable's audio.
 */
export async function synthesizeCombinedClip(urls: string[]): Promise<AudioBuffer> {
  const context = getAudioContext()
  const targetSampleRate = context.sampleRate

  const decoded = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url)
      const bytes = await response.arrayBuffer()
      return context.decodeAudioData(bytes)
    }),
  )
  const resampled = await Promise.all(decoded.map((buffer) => resampleTo(buffer, targetSampleRate)))
  const trimmed = resampled.map((buffer) => {
    const mono = toMono(buffer)
    const { start, end } = trimSilence(mono)
    return mono.subarray(start, end)
  })
  const combined = concatenateWithCrossfade(trimmed, targetSampleRate)

  const result = context.createBuffer(1, combined.length || 1, targetSampleRate)
  // `combined` can be typed as ArrayBufferLike-backed (it may flow through
  // subarray() on a decoded clip's channel data) — copyToChannel wants a
  // concrete ArrayBuffer-backed Float32Array; the runtime value is always one.
  result.copyToChannel(combined as Float32Array<ArrayBuffer>, 0)
  return result
}
