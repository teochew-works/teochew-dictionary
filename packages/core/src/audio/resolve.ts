import type { AudioReference, EnrichedEntry, EnrichedReading, ResolvedEntry, ResolvedReading } from '../enrichedEntry.js'

/**
 * One clip from `candidates`, chosen by a user's ranked speaker preference
 * (issue #274): the first candidate whose `speaker` appears in `preference`,
 * walked in rank order; falls back to `candidates[0]` — the build's own
 * default order (confidence, then recency, then whole-reading speaker
 * consistency; see `sortClipsByDefault` in `src/build/enrich.ts`) — when
 * `preference` is empty or none of it matches this slot. `null` when
 * `candidates` itself is empty (nothing recorded for this slot at all).
 *
 * Resolution is deliberately per-slot, not whole-reading-aware: it doesn't
 * try to keep one speaker across every syllable the way the build-time
 * default does for combinability (issue #191). A preference can therefore
 * produce a mixed-speaker reading; `canCombine` already requires a shared
 * speaker across every slot, so it correctly stops offering chained combined
 * playback for that reading rather than splicing voices together.
 */
export function pickClip(candidates: AudioReference[], preference: string[]): AudioReference | null {
  for (const speaker of preference) {
    const match = candidates.find((c) => c.speaker === speaker)
    if (match) return match
  }
  return candidates[0] ?? null
}

/**
 * `reading`, with every candidate list collapsed to one clip per slot via
 * `pickClip` — see `ResolvedReading`. `sandhiAudio` keeps the same
 * empty-slot fallback the build itself uses: a sandhi slot with no
 * candidates of its own resolves from the citation slot's candidates at that
 * index, not just its already-resolved pick, so a preferred speaker who only
 * recorded the citation form still wins there.
 */
export function resolveReadingAudio(reading: EnrichedReading, preference: string[]): ResolvedReading {
  return {
    ...reading,
    audio: reading.audio.map((candidates) => pickClip(candidates, preference)),
    sandhiAudio: reading.sandhiAudio.map((candidates, i) =>
      pickClip(candidates.length > 0 ? candidates : (reading.audio[i] ?? []), preference),
    ),
    wordAudio: pickClip(reading.wordAudio, preference),
  }
}

/** `entry`, with every reading resolved via `resolveReadingAudio`. */
export function resolveEntryAudio(entry: EnrichedEntry, preference: string[]): ResolvedEntry {
  return {
    ...entry,
    readings: entry.readings.map((reading) => resolveReadingAudio(reading, preference)),
  }
}

/**
 * Every distinct speaker id recorded anywhere in `entries` — the candidate
 * set a speaker-preference ranking control (Settings, issue #274) offers,
 * generalizing automatically as more speakers/varieties are added (issue
 * #37) rather than needing a hardcoded list. A clip with no `speaker` never
 * contributes — there's no identity to rank.
 */
export function collectSpeakers(entries: EnrichedEntry[]): string[] {
  const speakers = new Set<string>()
  for (const entry of entries) {
    for (const reading of entry.readings) {
      for (const candidates of [...reading.audio, ...reading.sandhiAudio, reading.wordAudio]) {
        for (const clip of candidates) if (clip.speaker) speakers.add(clip.speaker)
      }
    }
  }
  return [...speakers].sort()
}
