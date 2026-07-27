import { z } from 'zod'

/**
 * Schemas for the phonology data files. The data files are as much a part of the
 * product as the lexicon, so they get validated too — a typo in a vowel mapping
 * would otherwise silently corrupt every derived IPA string in the build.
 */

export const CONFIDENCE = ['high', 'medium', 'low'] as const

const mapping = z.object({
  ipa: z.string().min(1),
  confidence: z.enum(CONFIDENCE),
  note: z.string().optional(),
  /**
   * Source ids backing the mapping, resolved against `data/sources.yaml` by the
   * validator — the same provenance rule entries follow. Optional, because most
   * mappings are uncontroversial; what it exists for is recording the evidence
   * behind a `confidence` that was argued rather than assumed.
   */
  sources: z.array(z.string().min(1)).min(1).optional(),
})

export const pengimSchemeSchema = z.object({
  scheme: z.object({
    id: z.literal('pengim'),
    name: z.string(),
    name_zh: z.string().optional(),
    year: z.number().int().optional(),
    authority: z.string().optional(),
  }),
  syllable: z.object({
    nasalisation_marker: z.string().length(1),
    syllabic_nuclei: z.array(z.string().min(1)).min(1),
    checked_codas: z.array(z.string().min(1)).min(1),
  }),
  initials: z
    .array(
      z.object({
        pengim: z.string().min(1),
        example: z.string().optional(),
        example_pengim: z.string().optional(),
      }),
    )
    .min(1),
  zero_initial: z.boolean(),
  medials: z.array(z.string().min(1)),
  nuclei: z.array(z.string().min(1)).min(1),
  codas: z.array(z.string().min(1)).min(1),
  tones: z
    .array(
      z.object({
        number: z.number().int().min(1).max(8),
        name: z.string(),
        name_zh: z.string().optional(),
        contour: z.string(),
        checked: z.boolean(),
      }),
    )
    .length(8),
})

export const varietySchema = z.object({
  variety: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    name_zh: z.string().optional(),
    region: z.string().optional(),
    reference: z.boolean().optional(),
    inherits: z.string().optional(),
  }),
  initials: z.record(mapping).optional(),
  medials: z.record(mapping).optional(),
  nuclei: z.record(mapping).optional(),
  codas: z.record(mapping).optional(),
  nasalisation: z
    .object({ combining: z.string().min(1), confidence: z.enum(CONFIDENCE) })
    .optional(),
  tones: z.record(z.string()).optional(),
  /** Whole-rime overrides that the compositional rules do not predict. */
  irregular: z.record(mapping).optional(),
})

export const pojSchema = z.object({
  scheme: z.object({ id: z.literal('poj'), name: z.string(), name_zh: z.string().optional() }),
  initials: z.record(z.string()),
  medials: z.record(z.string()),
  nuclei: z.record(z.string()),
  codas: z.record(z.string()),
  nasalisation: z.string(),
  tones: z.record(z.object({ combining: z.string(), name: z.string() })),
  tone_vowel_priority: z.array(z.string().min(1)).min(1),
  alternates: z
    .object({
      nuclei: z.record(z.array(z.string())).optional(),
      initials: z.record(z.array(z.string())).optional(),
    })
    .optional(),
})

export const sandhiSchema = z.object({
  sandhi: z.object({
    id: z.string().min(1),
    variety: z.string().min(1),
    needs_review: z.boolean().optional(),
    scope: z.string().optional(),
  }),
  rules: z.record(
    z.object({
      to: z.number().int().min(1).max(8),
      contour: z.string(),
      note: z.string().optional(),
    }),
  ),
  exceptions: z.record(z.unknown()).optional(),
})

export type PengimScheme = z.infer<typeof pengimSchemeSchema>
export type Variety = z.infer<typeof varietySchema>
export type PojScheme = z.infer<typeof pojSchema>
export type SandhiTable = z.infer<typeof sandhiSchema>
export type Confidence = (typeof CONFIDENCE)[number]
