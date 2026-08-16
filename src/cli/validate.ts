import { validate, TONES, type Issue } from '../validate/index.js'
import { dim, green, red, yellow } from './colour.js'

/**
 * `npm run validate` — check the dataset and exit non-zero on any error.
 * Warnings are reported but do not fail, so a lexicon in progress stays
 * buildable.
 */

function format(issue: Issue): string {
  const tag = issue.level === 'error' ? red('error') : yellow('warn ')
  const where = [issue.file, issue.id, issue.path].filter(Boolean).join(dim(' › '))
  return `  ${tag} ${where}\n        ${issue.message}`
}

const report = validate()

const errors = report.issues.filter((i) => i.level === 'error')
const warnings = report.issues.filter((i) => i.level === 'warning')

if (errors.length > 0) {
  console.log(red(`\n${errors.length} error${errors.length === 1 ? '' : 's'}\n`))
  for (const i of errors) console.log(format(i))
}

if (warnings.length > 0) {
  console.log(yellow(`\n${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n`))
  for (const i of warnings) console.log(format(i))
}

const summary = [
  `${report.entryCount} entries`,
  `${report.readingCount} readings`,
  `${report.reviewCount} flagged for review`,
]
console.log(`\n${dim(summary.join(dim(' · ')))}`)

// Tone coverage. An unattested tone is highlighted rather than printed as a
// plain zero, because that is the shape the tone 6/7 collapse took: every entry
// individually valid, one whole tone category missing.
const tones = TONES.map((t) => {
  const n = report.toneCounts[t] ?? 0
  return n === 0 ? red(`T${t}:${n}`) : dim(`T${t}:${n}`)
})
console.log(`${dim('tones')}  ${tones.join(' ')}`)

if (errors.length === 0) {
  console.log(green('✓ dataset is valid'))
  process.exit(0)
}

console.log(red('✗ validation failed'))
process.exit(1)
