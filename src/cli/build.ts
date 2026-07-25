import { statSync } from 'node:fs'
import { join } from 'node:path'

import { DIST_DIR } from '../paths.js'
import { build } from '../build/index.js'
import { validate } from '../validate/index.js'

/**
 * `npm run build` — validate, then emit dist/.
 *
 * The build refuses to run on a dataset with errors: a corrupt artifact that
 * looks fine is worse than no artifact.
 */

const report = validate()
if (report.errorCount > 0) {
  console.error(`✗ ${report.errorCount} validation error(s) — run \`npm run validate\` for detail`)
  process.exit(1)
}

const result = build()

const kb = (name: string) => `${(statSync(join(DIST_DIR, name)).size / 1024).toFixed(1)} KiB`
console.log(`built ${result.entries} entries · ${result.readings} readings`)
for (const name of result.outputs) console.log(`  dist/${name.padEnd(12)} ${kb(name)}`)
if (report.warningCount > 0) console.log(`\n${report.warningCount} warning(s) — see \`npm run validate\``)
