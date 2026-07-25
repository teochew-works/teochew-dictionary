import { readFileSync } from 'node:fs'

import { loadEntries } from '../data/load.js'
import type { ImportResult, Proposal } from './types.js'

/**
 * CC-CEDICT importer.
 *
 * CC-CEDICT is a Mandarin dictionary. It contains NO Teochew pronunciation, so
 * this importer deliberately cannot propose a reading — only English glosses for
 * headwords that already exist in our dataset, where the Teochew reading came
 * from somewhere trustworthy.
 *
 * Letting a Mandarin source populate a Teochew reading is the single most
 * damaging mistake available here, so the type of this module makes it
 * impossible rather than merely discouraged.
 *
 * Format (one entry per line, `#` comments):
 *   繁體 简体 [pin1 yin1] /gloss one/gloss two/
 */

export interface CedictRecord {
  traditional: string
  simplified: string
  pinyin: string
  glosses: string[]
}

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.+)\/\s*$/u

export function parseCedict(text: string): CedictRecord[] {
  const out: CedictRecord[] = []
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue
    const m = LINE.exec(line)
    if (!m) continue
    out.push({
      traditional: m[1]!,
      simplified: m[2]!,
      pinyin: m[3]!,
      glosses: m[4]!.split('/').filter(Boolean),
    })
  }
  return out
}

/** Glosses that add nothing to a Teochew entry. */
function isUseless(gloss: string): boolean {
  return (
    gloss.startsWith('variant of') ||
    gloss.startsWith('old variant of') ||
    gloss.startsWith('see ') ||
    gloss.startsWith('CL:') || // classifier annotations
    /^surname /u.test(gloss)
  )
}

export function importCedict(path: string, retrieved: string): ImportResult {
  const records = parseCedict(readFileSync(path, 'utf8'))

  // Index by both character forms — our headwords may use either.
  const byHeadword = new Map<string, CedictRecord[]>()
  for (const r of records) {
    for (const form of new Set([r.traditional, r.simplified])) {
      const bucket = byHeadword.get(form)
      if (bucket) bucket.push(r)
      else byHeadword.set(form, [r])
    }
  }

  const proposals: Proposal[] = []
  const misses: string[] = []

  for (const { entry } of loadEntries()) {
    const forms = [entry.headword, ...(entry.variants ?? [])]
    const matches = forms.flatMap((f) => byHeadword.get(f) ?? [])
    if (matches.length === 0) {
      misses.push(entry.headword)
      continue
    }

    const existing = new Set(
      entry.senses.flatMap((s) => s.gloss_en.map((g) => g.toLowerCase())),
    )
    const fresh = [
      ...new Set(
        matches
          .flatMap((m) => m.glosses)
          .filter((g) => !isUseless(g))
          .filter((g) => !existing.has(g.toLowerCase())),
      ),
    ]
    if (fresh.length === 0) continue

    const flags = ['gloss-only: CC-CEDICT is Mandarin and carries no Teochew reading']
    if (matches.length > 1) {
      flags.push(`${matches.length} CC-CEDICT records matched — senses may need splitting`)
    }

    proposals.push({
      target_id: entry.id,
      headword: entry.headword,
      senses: [{ gloss_en: fresh }],
      source: 'cedict',
      retrieved,
      flags,
    })
  }

  return {
    source: 'cedict',
    proposals,
    misses,
    notes: [
      `parsed ${records.length} CC-CEDICT records`,
      'proposals are gloss-only by design; readings must come from a Teochew source',
      'CC-CEDICT is CC-BY-SA-4.0 — merging these glosses binds the dataset to share-alike',
    ],
  }
}
