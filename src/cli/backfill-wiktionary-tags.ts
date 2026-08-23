import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, stringify } from 'yaml'
import type { YAMLMap } from 'yaml'

import { listEntryFiles } from '../data/load.js'
import { buildCandidates, matchEntrySenses } from '../importers/entry-tag-matching.js'
import { loadWiktextractIndex } from '../importers/wiktextract.js'
import { ENTRIES_DIR } from '../paths.js'
import { entryFileSchema } from '../schema/entry.js'

/**
 * `npm run backfill:wiktionary-tags [-- --write]` (issue #102, #105)
 *
 * Backfills `senses[].tags`/`topics`/`alt_of` onto entries already
 * hand-merged into data/entries/*.yaml, matching each sense against the
 * local wiktextract cache (see src/importers/entry-tag-matching.js for the
 * matching rules). Dry-run by default — prints a summary only; pass --write
 * to apply.
 *
 * Only fills in a field a sense doesn't already have — never overwrites or
 * re-derives one that's already present. This makes the script safe to
 * re-run (e.g. once #105 added `topics` to a pipeline that had already
 * backfilled `tags`/`alt_of` for #102): without this check, a sense that
 * already carried `tags` would get a second, duplicate `tags:` key spliced
 * in alongside its existing one, since the splice only ever appends.
 *
 * Deliberately not part of any importer: importers never write to
 * data/entries/ (see src/importers/types.ts), but this script edits data
 * that has already been reviewed and merged, only adding metadata rather
 * than proposing new content — the same kind of one-off the `retrieved`-date
 * backfill (f2026da) did once for this same directory.
 *
 * These files are hand-typed, not machine-generated, so `yaml`'s own
 * parse→stringify round-trip doesn't reproduce them: it rewraps folded
 * scalars to its own line width, restyles flow collections
 * (`[one, "1"]` → `[ one, "1" ]`), and drops blank-line grouping between
 * entries — confirmed on this dataset before settling on this approach.
 * Instead, this only ever *reads* structure from a parsed `Document` (node
 * `.range`s, byte offsets into the original text) and splices new
 * `tags:`/`topics:`/`alt_of:` lines directly into the pristine source
 * string — `doc.toString()` is never called on a whole file, so every byte
 * this script doesn't touch survives untouched.
 */

const write = process.argv.slice(2).includes('--write')

const index = loadWiktextractIndex()

let entriesScanned = 0
let entriesMatched = 0
let sensesTagged = 0
let sensesUnchanged = 0
let sensesSkipped = 0
let filesChanged = 0

/** The indentation of a mapping's keys, read from its last existing key (never the sequence item's own `- ` marker). */
function indentOf(map: YAMLMap, raw: string): string {
  const lastKey = map.items[map.items.length - 1]!.key as { range: [number, number, number] }
  const lineStart = raw.lastIndexOf('\n', lastKey.range[0] - 1) + 1
  return raw.slice(lineStart, lastKey.range[0])
}

/**
 * `lineWidth: 0` disables yaml's default 80-column wrapping — without it, a
 * long value list (topics arrays run longer than tags/alt_of ever did, up to
 * 17 entries) gets stringified onto multiple lines, breaking every
 * assumption in this file that a spliced field is exactly one line.
 */
function fieldLine(indent: string, key: string, values: string[]): string {
  const flow = stringify(values, { flow: true, flowCollectionPadding: false, lineWidth: 0 }).trim()
  return `${indent}${key}: ${flow}\n`
}

for (const file of listEntryFiles()) {
  const path = join(ENTRIES_DIR, file)
  const raw = readFileSync(path, 'utf8')
  const doc = parseDocument(raw)
  const parsed = entryFileSchema.parse(doc.toJS())

  const edits: { offset: number; text: string }[] = []

  parsed.entries.forEach((entry, entryIndex) => {
    entriesScanned += 1

    const headwords = [entry.headword, ...(entry.variants ?? [])]
    const candidates = buildCandidates(headwords, index)
    // `candidates` includes every wiktextract sense, tagged or not — see
    // buildCandidates's doc comment for why untagged ones still count for
    // cardinality — so check for actual signal before counting this entry as
    // matched, not just for a wiktextract record existing at all.
    if (!candidates.some((c) => c.tags.length > 0 || c.topics.length > 0 || c.altOf.length > 0)) return
    entriesMatched += 1

    const matches = matchEntrySenses(
      entry.senses.map((s) => s.pos),
      candidates,
    )

    entry.senses.forEach((sense, senseIndex) => {
      const match = matches.get(senseIndex)
      if (!match) {
        sensesSkipped += 1
        return
      }

      const senseNode = doc.getIn(['entries', entryIndex, 'senses', senseIndex]) as YAMLMap
      const indent = indentOf(senseNode, raw)
      const text =
        (match.tags.length > 0 && !sense.tags ? fieldLine(indent, 'tags', match.tags) : '') +
        (match.topics.length > 0 && !sense.topics ? fieldLine(indent, 'topics', match.topics) : '') +
        (match.altOf.length > 0 && !sense.alt_of ? fieldLine(indent, 'alt_of', match.altOf) : '')

      if (!text) {
        sensesUnchanged += 1
        return
      }
      sensesTagged += 1

      const [, end] = senseNode.range as [number, number, number]
      edits.push({ offset: end, text })
    })
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

console.log(`${entriesScanned} entries scanned, ${entriesMatched} matched a wiktextract record`)
console.log(
  `${sensesTagged} sense(s) tagged, ${sensesUnchanged} already had every matched field, ${sensesSkipped} skipped (no unambiguous match)`,
)
console.log(`${filesChanged} file(s) ${write ? 'written' : 'would change'}`)
if (!write) console.log('dry run — pass --write to apply')
