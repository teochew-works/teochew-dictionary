import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import type { YAMLMap } from 'yaml'

import { listEntryFiles } from '../data/load.js'
import { buildHskIndex, matchEntryLevel, parseHskWordlist } from '../importers/mandarin-cognate-level.js'
import { ENTRIES_DIR } from '../paths.js'
import { entryFileSchema } from '../schema/entry.js'

/**
 * `npm run backfill:mandarin-level -- <path/to/complete.json> [--write]`
 * (issue #110, signal 1)
 *
 * Backfills `level` onto entries already hand-merged into
 * data/entries/*.yaml, matching each entry's headword/variants against a
 * local copy of `drkameleon/complete-hsk-vocabulary`'s `complete.json`
 * (`data/sources.yaml`'s `hsk-vocabulary` id — download it yourself, same as
 * `backfill:wiktionary-tags`' wiktextract cache or `import -- cedict`'s local
 * file). Dry-run by default — prints a summary only; pass --write to apply.
 *
 * Only fills `level` on an entry that doesn't already have one — never
 * overwrites or re-derives an existing value, so this is safe to re-run
 * (e.g. after the HSK wordlist is refreshed) without double-splicing a
 * second `level:` key in. See src/cli/backfill-wiktionary-tags.ts, whose
 * splice mechanics this mirrors exactly (same header comment there explains
 * why: these files are hand-typed, so `yaml`'s parse→stringify doesn't
 * round-trip them — this script only ever reads structure from a parsed
 * `Document` and splices a new `level:` line directly into the pristine
 * source string).
 *
 * Deliberately not part of any importer: importers never write to
 * data/entries/ (see src/importers/types.ts), but this script edits data
 * that has already been reviewed and merged, only adding metadata rather
 * than proposing new content.
 */

const args = process.argv.slice(2)
const write = args.includes('--write')
const wordlistPath = args.find((a) => !a.startsWith('--'))

if (!wordlistPath) {
  console.error('usage: npm run backfill:mandarin-level -- <path/to/complete.json> [--write]')
  console.error('download complete.json from https://github.com/drkameleon/complete-hsk-vocabulary')
  process.exit(2)
}
if (!existsSync(wordlistPath)) {
  console.error(`backfill:mandarin-level: no such file: ${wordlistPath}`)
  process.exit(1)
}

const hskIndex = buildHskIndex(parseHskWordlist(readFileSync(wordlistPath, 'utf8')))

/** The indentation of a mapping's keys, read from its last existing key. */
function indentOf(map: YAMLMap, raw: string): string {
  const lastKey = map.items[map.items.length - 1]!.key as { range: [number, number, number] }
  const lineStart = raw.lastIndexOf('\n', lastKey.range[0] - 1) + 1
  return raw.slice(lineStart, lastKey.range[0])
}

let entriesScanned = 0
let entriesSkipped = 0
let entriesMatched = 0
let entriesAmbiguous = 0
let entriesUnmatched = 0
let filesChanged = 0

for (const file of listEntryFiles()) {
  const path = join(ENTRIES_DIR, file)
  const raw = readFileSync(path, 'utf8')
  const doc = parseDocument(raw)
  const parsed = entryFileSchema.parse(doc.toJS())

  const edits: { offset: number; text: string }[] = []

  parsed.entries.forEach((entry, entryIndex) => {
    entriesScanned += 1

    if (entry.level) {
      entriesSkipped += 1
      return
    }

    const match = matchEntryLevel([entry.headword, ...(entry.variants ?? [])], hskIndex)
    if (!match) {
      entriesUnmatched += 1
      return
    }
    if ('ambiguous' in match) {
      entriesAmbiguous += 1
      return
    }
    entriesMatched += 1

    const entryNode = doc.getIn(['entries', entryIndex]) as YAMLMap
    const indent = indentOf(entryNode, raw)
    const [, end] = entryNode.range as [number, number, number]
    edits.push({ offset: end, text: `${indent}level: ${match.level}\n` })
  })

  if (edits.length === 0) continue
  filesChanged += 1

  if (write) {
    edits.sort((a, b) => b.offset - a.offset)
    let out = raw
    for (const edit of edits) out = out.slice(0, edit.offset) + edit.text + out.slice(edit.offset)
    writeFileSync(path, out)
  }
}

console.log(`${entriesScanned} entries scanned, ${entriesSkipped} already had a level`)
console.log(
  `${entriesMatched} matched an HSK cognate, ${entriesAmbiguous} ambiguous (spanned >1 CEFR level), ${entriesUnmatched} unmatched`,
)
console.log(`${filesChanged} file(s) ${write ? 'written' : 'would change'}`)
if (!write) console.log('dry run — pass --write to apply')
