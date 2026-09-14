import { z } from 'zod'

/**
 * Load-time reading corrections (ADR-0028): `data/patches/*.yaml` validated
 * against this schema. Applied in `src/data/patches.ts` when entries are
 * read, never written back to `data/entries/` — those files mirror an import
 * source and must stay byte-identical to it.
 */

export const readingPatchSchema = z
  .object({
    /** Stable slug, e.g. "kue1-ngaing2-keyan-typo". */
    id: z.string().min(1),
    /** `entry.id` of the entry the patch targets. */
    entry: z.string().min(1),
    match: z.object({
      /** Full `reading.pengim` string, exactly as it appears on disk. */
      pengim: z.string().min(1),
      /** Disambiguator only; compared against the reading's `variety` (defaulting to `chaozhou`). */
      variety: z.string().min(1).optional(),
    }),
    set: z
      .object({
        pengim: z.string().min(1).optional(),
        variety: z.string().min(1).optional(),
      })
      .refine((s) => s.pengim !== undefined || s.variety !== undefined, {
        message: 'a patch must `set` a `pengim` and/or a `variety`',
      }),
    /** Why this reading is wrong and what corrects it — cite the evidence. */
    reason: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']),
    /** GitHub issue number this patch was raised from, if any. */
    issue: z.number().int().optional(),
  })
  .refine((p) => p.set.pengim !== p.match.pengim || p.set.variety !== p.match.variety, {
    message: 'patch is a no-op: `set` does not differ from `match`',
  })

export const readingPatchesFileSchema = z.object({
  patches: z.array(readingPatchSchema).min(1),
})

export type ReadingPatch = z.infer<typeof readingPatchSchema>
