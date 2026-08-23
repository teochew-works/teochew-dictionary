import { z } from 'zod'

/**
 * Schemas for the phonology data files. The data files are as much a part of the
 * product as the lexicon, so they get validated too — a typo in a vowel mapping
 * would otherwise silently corrupt every derived IPA string in the build.
 */

export const CONFIDENCE = ['high', 'medium', 'low'] as const

/** True for a real calendar date — `\d{4}-\d{2}-\d{2}` also matches e.g. 2026-02-30. */
function isValidCalendarDate(s: string): boolean {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

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

/** This project's own GitHub repo — the single source of truth for the URL pattern below. */
export const GITHUB_REPO = 'teochew-works/teochew-dictionary'

/**
 * A GitHub Release asset download URL, pinned to this project's own repo:
 * https://github.com/teochew-works/teochew-dictionary/releases/download/<tag>/<asset>.
 * The required literal `download` segment right after `releases/` already
 * excludes the floating `/releases/latest/download/...` alias (which has
 * `latest`, not `download`, in that position) — a stored reference is always
 * pinned to a tag, so it can't start pointing at different bytes later.
 * Pinning the owner/repo also stops a stored reference from silently
 * pointing at an unrelated project's release asset. Case-insensitive on the
 * owner/repo segment, matching GitHub's own (case-insensitive) URL routing.
 */
const GITHUB_RELEASE_ASSET_URL = new RegExp(
  `^https://github\\.com/${GITHUB_REPO}/releases/download/[\\w.-]+/[\\w.-]+$`,
  'iu',
)

/**
 * A recorded clip for one whole Peng'im syllable (e.g. `dio5`), in one variety.
 * Whole-syllable, not per-component (initial/medial/nucleus/coda/tone) — see
 * `data/phonology/REVIEW.md` § 11 for the rationale.
 */
const audioClip = z.object({
  /**
   * Where the clip's bytes actually live (see `data/phonology/REVIEW.md` § 12):
   * a GitHub Release asset URL, not a path into this repo. Stored in full, not
   * a bare filename plus a reconstructed base-URL convention, so the YAML
   * manifest alone is enough to fetch the clip.
   */
  url: z.string().regex(GITHUB_RELEASE_ASSET_URL, "must be a GitHub Release asset download URL"),
  confidence: z.enum(CONFIDENCE),
  note: z.string().optional(),
  /**
   * Unlike a phonology mapping's `sources` (evidentiary, optional), a clip's
   * `sources` is its actual provenance: `licence` is derived from it the same
   * way an entry's is (see ../data/licence.ts), so a clip with no citable
   * origin cannot be distributed at all.
   */
  sources: z.array(z.string().min(1)).min(1),
  /** Pseudonymous speaker/recordist identifier — not necessarily a real name. */
  speaker: z.string().min(1).optional(),
  recorded: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .refine(isValidCalendarDate, 'must be a valid calendar date')
    .optional(),
  /**
   * `sha256:<64 hex chars>`. Required: with the clip hosted externally there
   * is no git-tracked local copy to compare against, and a release asset can
   * be replaced independently of any `data/` commit — this is the only
   * integrity check left, and one of the manifest's three named components
   * (URL + checksum + licence, see REVIEW.md § 12). Hex accepted in either
   * case and normalised to lowercase, since common tools (e.g. PowerShell's
   * `Get-FileHash`) emit uppercase.
   */
  checksum: z
    .string()
    .regex(/^sha256:[0-9a-fA-F]{64}$/u)
    .transform((s) => s.toLowerCase()),
})

export const audioSchema = z.object({
  audio: z.object({
    id: z.string().min(1),
    variety: z.string().min(1),
  }),
  /** Keyed by canonical Peng'im syllable, e.g. `dio5` — matches `syllable-inventory.yaml` item keys. */
  clips: z.record(audioClip),
  /**
   * Whole-word/phrase clips, keyed by a reading's full space-joined pengim
   * string (e.g. `bhi7 jui2`) rather than a single syllable — see
   * `data/phonology/REVIEW.md` § 16. Same shape as `clips`, deliberately not
   * folded into it: the key space is different (syllable vs. reading
   * string), and conflating them would make a lookup ambiguous for any
   * single-syllable reading. No inheritance and no compositional fallback,
   * same rule as `clips` — a reading either has a word clip or it doesn't.
   */
  wordClips: z.record(audioClip).optional(),
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
export type AudioClip = z.infer<typeof audioClip>
export type Audio = z.infer<typeof audioSchema>
export type Confidence = (typeof CONFIDENCE)[number]
