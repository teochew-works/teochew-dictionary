import { z } from 'zod'

/**
 * The entry schema. This is the source of truth for `data/entries/*.yaml`, for
 * the generated JSON Schema (`npm run schema`), and for the TypeScript types
 * used throughout the tooling.
 *
 * Design rule: store what a human must know, derive everything else. A reading
 * carries Peng'im only; IPA and POJ are computed at build time. The `ipa`/`poj`
 * override fields exist for genuinely irregular forms and require a `note`
 * explaining why the derivation is wrong — the validator enforces that.
 */

export const PART_OF_SPEECH = [
  'noun',
  'proper-noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'numeral',
  'classifier',
  'preposition',
  'conjunction',
  'particle',
  'interjection',
  'prefix',
  'suffix',
  'phrase',
  'idiom',
] as const

export const REGISTER = ['colloquial', 'literary', 'both'] as const

/** Peng'im: one or more syllables, each `letters + tone digit`, space separated. */
const pengimString = z
  .string()
  .min(1)
  .regex(
    /^[a-zêA-ZÊ]+[1-8](?: [a-zêA-ZÊ]+[1-8])*$/u,
    'must be space-separated Peng\'im syllables, each ending in a tone digit 1–8',
  )

export const exampleSchema = z.object({
  hanzi: z.string().min(1),
  pengim: pengimString,
  en: z.string().min(1),
  note: z.string().optional(),
})

export const readingSchema = z
  .object({
    /** Source of truth. IPA and POJ are derived from this. */
    pengim: pengimString,
    /** Which variety this reading is attested in. Defaults to the reference variety. */
    variety: z.string().default('chaozhou'),
    register: z.enum(REGISTER).optional(),
    /** Override for irregular forms only. Requires `note`. */
    ipa: z.string().optional(),
    /** Override for irregular forms only. Requires `note`. */
    poj: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((r) => !(r.ipa || r.poj) || !!r.note, {
    message: 'an `ipa` or `poj` override must be justified with a `note`',
    path: ['note'],
  })

export const senseSchema = z.object({
  pos: z.enum(PART_OF_SPEECH),
  gloss_en: z.array(z.string().min(1)).min(1),
  gloss_zh: z.array(z.string().min(1)).optional(),
  note: z.string().optional(),
  examples: z.array(exampleSchema).optional(),
})

export const entrySchema = z.object({
  /** Stable, URL-safe identifier. Convention: `<first-reading-pengim>-<headword>`. */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9ê-]+(-[^\s]+)?$/u, 'id must be lowercase, hyphen-separated'),
  /** The Chinese-character headword. */
  headword: z.string().min(1),
  /** Alternative character writings of the same word. */
  variants: z.array(z.string().min(1)).optional(),
  readings: z.array(readingSchema).min(1),
  senses: z.array(senseSchema).min(1),
  tags: z.array(z.string().min(1)).optional(),
  /**
   * Rough commonness band, 1 (rarest) – 5 (core everyday vocabulary).
   * Used to rank search results and to pick what to work on next.
   */
  frequency: z.number().int().min(1).max(5).optional(),
  /** Source ids, resolved against `data/sources.yaml`. */
  sources: z.array(z.string().min(1)).min(1),
  /** Set when the entry is known to need a specialist's eye. */
  needs_review: z.boolean().optional(),
})

export const entryFileSchema = z.object({
  entries: z.array(entrySchema).min(1),
})

export const sourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  licence: z.string().min(1),
  url: z.string().url().optional(),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  note: z.string().optional(),
})

export const sourcesFileSchema = z.object({
  sources: z.array(sourceSchema).min(1),
})

export type Example = z.infer<typeof exampleSchema>
export type Reading = z.infer<typeof readingSchema>
export type Sense = z.infer<typeof senseSchema>
export type Entry = z.infer<typeof entrySchema>
export type Source = z.infer<typeof sourceSchema>
export type PartOfSpeech = (typeof PART_OF_SPEECH)[number]
