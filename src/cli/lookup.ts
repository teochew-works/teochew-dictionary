import { NotBuiltError, lookup, openDb } from '../lookup/index.js'

/**
 * `npm run lookup -- <query>` — search the built dictionary.
 *
 * Query by Chinese characters, Peng'im (with or without tone digits), POJ, or an
 * English gloss; the matcher works out which was meant.
 */

const COLOUR = process.stdout.isTTY && !process.env['NO_COLOR']
const c = (code: string, s: string) => (COLOUR ? `[${code}m${s}[0m` : s)
const bold = (s: string) => c('1', s)
const dim = (s: string) => c('2', s)
const cyan = (s: string) => c('36', s)

const args = process.argv.slice(2)
let variety: string | null = null
const terms: string[] = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--variety') {
    variety = args[i + 1] ?? null
    i += 1 // consume the value
    continue
  }
  terms.push(args[i]!)
}
const query = terms.join(' ')

if (!query) {
  console.error('usage: npm run lookup -- <query> [--variety chaozhou|shantou|chaoyang]')
  process.exit(2)
}

let db
try {
  db = openDb()
} catch (e) {
  if (e instanceof NotBuiltError) {
    console.error(e.message)
    process.exit(1)
  }
  throw e
}

const hits = lookup(query, db)

if (hits.length === 0) {
  console.log(dim(`no match for '${query}'`))
  process.exit(1)
}

for (const { entry, match } of hits) {
  const readings = variety
    ? entry.readings.filter((r) => r.variety === variety)
    : entry.readings

  console.log(`\n${bold(entry.headword)}  ${dim(`(${match})`)}`)

  for (const r of readings) {
    const bits = [cyan(r.pengim), r.ipa, dim(r.poj)]
    const tags = [r.variety, r.register].filter(Boolean).join(', ')
    console.log(`  ${bits.join('  ')}  ${dim(`[${tags}]`)}`)
    if (r.sandhi !== r.pengim) console.log(`    ${dim(`sandhi: ${r.sandhi}`)}`)
    for (const caveat of r.ipa_caveats) console.log(`    ${dim(`⚠ ${caveat}`)}`)
  }

  for (const s of entry.senses) {
    console.log(`  ${dim(s.pos)}  ${s.gloss_en.join(', ')}`)
    if (s.gloss_zh) console.log(`        ${dim(s.gloss_zh.join(', '))}`)
    for (const ex of s.examples ?? []) {
      console.log(`        ${ex.hanzi}  ${cyan(ex.pengim)}`)
      console.log(`        ${dim(ex.en)}`)
    }
  }

  if (entry.needs_review) console.log(dim('  ⚠ flagged for review'))
}

db.close()
