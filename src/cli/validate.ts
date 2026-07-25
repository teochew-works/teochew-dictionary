import { validate, type Issue } from '../validate/index.js'

/**
 * `npm run validate` — check the dataset and exit non-zero on any error.
 * Warnings are reported but do not fail, so a lexicon in progress stays
 * buildable.
 */

const COLOUR = process.stdout.isTTY && !process.env['NO_COLOR']
const c = (code: string, s: string) => (COLOUR ? `[${code}m${s}[0m` : s)
const red = (s: string) => c('31', s)
const yellow = (s: string) => c('33', s)
const green = (s: string) => c('32', s)
const dim = (s: string) => c('2', s)

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

if (errors.length === 0) {
  console.log(green('✓ dataset is valid'))
  process.exit(0)
}

console.log(red('✗ validation failed'))
process.exit(1)
