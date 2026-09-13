import { useMemo, useState } from 'react'
import { resolveEntryAudio } from '@teochew/core'
import type { EnrichedEntry, ResolvedEntry } from '@teochew/core'
import { readSpeakerPreference } from '../settings/speakerPreference'

/**
 * `entries` (straight from `dist/dict.json` via `useDictionary`), resolved to
 * one clip per syllable/word slot via the stored speaker preference (issue
 * #274) — every downstream consumer (`hasAudio`, `canCombine`, `ReadingAudio`,
 * deck filtering) works against `ResolvedEntry`/`ResolvedReading`, never the
 * raw candidate lists.
 *
 * Reads the preference once via `useState`'s lazy initializer, matching how
 * `audioMode`/`pronunciationMode` are read elsewhere: the caller
 * (`DictionaryView`/`FlashcardsView`) fully unmounts and remounts on tab
 * switch, so a change made in Settings takes effect the next time that tab is
 * opened — no live cross-tab reactivity needed.
 */
export function useResolvedEntries(entries: EnrichedEntry[]): ResolvedEntry[] {
  const [preference] = useState(readSpeakerPreference)
  return useMemo(() => entries.map((entry) => resolveEntryAudio(entry, preference)), [entries, preference])
}
