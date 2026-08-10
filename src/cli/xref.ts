import { fetchLearnteochewChart, writeLearnteochewChart } from '../importers/learnteochew.js'

/**
 * `npm run xref -- <source>` — fetch an external phonology reference chart and
 * cache it to data/phonology/external/, for the syllable-inventory cross-check.
 *
 * Network-touching, so deliberately kept out of `npm run check` (same reason
 * `npm run import` is excluded) — `npm run inventory` and its drift-check test
 * read the cached snapshot this writes, not the live page.
 */

const USAGE = 'usage:\n  npm run xref -- learnteochew'

const [source] = process.argv.slice(2)

if (!source) {
  console.error(USAGE)
  process.exit(2)
}

const today = new Date().toISOString().slice(0, 10)

switch (source) {
  case 'learnteochew': {
    console.log('fetching learnteochew.com pronunciation page…')
    const chart = await fetchLearnteochewChart(today)
    const out = writeLearnteochewChart(chart)
    console.log(
      `${chart.initials.length} initials, ${chart.finals.length} finals, ${chart.tones.length} tones → ${out}`,
    )
    console.log("remember to bump 'learnteochew's `retrieved:` date in data/sources.yaml by hand")
    break
  }

  default:
    console.error(`unknown external source '${source}'\n\n${USAGE}`)
    process.exit(2)
}
