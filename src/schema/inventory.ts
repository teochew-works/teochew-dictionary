import { z } from 'zod'

/**
 * Schemas for the derived checklist files in `data/wordlists/` and the cached
 * external reference snapshot in `data/phonology/external/`. Unlike
 * `data/wordlists/swadesh-207.yaml` (hand-maintained), the syllable inventory
 * is 100% mechanically derivable from `pengim.yaml` and `data/entries/`, so
 * these schemas exist to validate a file that a script — not a human — keeps
 * up to date.
 */

export const SYLLABLE_STATUS = ['attested', 'unattested'] as const

const varietyStatusSchema = z
  .object({
    status: z.enum(SYLLABLE_STATUS),
    /** Entry ids whose own citation reading is this syllable. Omitted when none. */
    attested_entries: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Entry ids where this syllable is the tone-sandhi surface form of a
     * non-final syllable in one of their readings (issue #34/#48). Omitted
     * when none.
     */
    sandhi_attested_entries: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    (v) => (v.status === 'attested') === (v.attested_entries !== undefined || v.sandhi_attested_entries !== undefined),
    {
      message: "`attested_entries` or `sandhi_attested_entries` must be present iff `status` is 'attested'",
    },
  )

export const syllableInventoryItemSchema = z.object({
  /** Canonical Peng'im form, e.g. "dio5". Everything else is derived from this. */
  syllable: z.string().min(1),
  /** Keyed by external source id, e.g. { learnteochew: true }. */
  external: z.record(z.boolean()),
  /** Keyed by variety id. */
  varieties: z.record(varietyStatusSchema),
})

export const syllableInventorySchema = z.object({
  list: z.literal('syllable-inventory'),
  varieties: z.array(z.string().min(1)).min(1),
  external_sources: z.array(z.string().min(1)),
  items: z.array(syllableInventoryItemSchema).min(1),
})

export const externalChartSchema = z.object({
  /** Resolved against `data/sources.yaml`. */
  source: z.string().min(1),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  initials: z.array(z.string().min(1)),
  finals: z.array(z.string().min(1)),
  tones: z.array(z.string().min(1)),
})

export type SyllableStatus = (typeof SYLLABLE_STATUS)[number]
export type SyllableInventoryItem = z.infer<typeof syllableInventoryItemSchema>
export type SyllableInventory = z.infer<typeof syllableInventorySchema>
export type ExternalChart = z.infer<typeof externalChartSchema>
