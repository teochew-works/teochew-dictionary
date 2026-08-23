/**
 * Types for audio-clip import proposals (issue #106) — distinct from the
 * entry-shaped `Proposal`/`ImportResult` in ./types.js, which model a
 * proposed dictionary entry (headword/readings/senses). A recording isn't a
 * dictionary entry: there's no headword/gloss to propose, and it may end up
 * keyed to either `clips` or `wordClips` (see data/phonology/REVIEW.md § 16)
 * depending on `syllableCount` — a decision the existing `Proposal` shape has
 * no room for.
 */

export interface AudioClipProposal {
  /** Recovered Peng'im transcription — one or more space-separated syllables. */
  pengim: string
  /** 1 → belongs in `clips` once merged; ≥2 → belongs in `wordClips`. */
  syllableCount: number
  hanzi?: string
  /** Commons page title, e.g. `File:LL-Q36759-Austin_Zhang-bhua5.wav`. */
  commonsTitle: string
  /** Direct file URL from imageinfo — where the bytes live on Commons today, before any re-hosting. */
  commonsUrl: string
  /** Commons/Wikimedia username of the uploader — see AUDIO-CONSENT.md's scoping note on this differing from a project-assigned pseudonym. */
  speaker: string
  licence: string
  uploadDate?: string
  /**
   * Free text carried through as-is from Commons, when present, for a human
   * to judge variety/accent fit at merge time — e.g. "Puning-Chaoyang mixed
   * accent". The importer never classifies this itself (see
   * data/phonology/REVIEW.md § 16).
   */
  accentNote?: string
  /** Why a human should look — e.g. a licence mismatch, an ambiguous transcription. */
  flags?: string[]
}

export interface AudioImportResult {
  source: string
  proposals: AudioClipProposal[]
  /** Commons titles the importer looked at but could not turn into a proposal. */
  misses: string[]
  notes: string[]
}
