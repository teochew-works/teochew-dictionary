import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DIST_DIR } from '../paths.js'
import { emitAllSchemas } from '../schema/emit.js'

/**
 * `npm run schema` — emit every schema in `src/schema/` as JSON Schema.
 *
 * Zod is the single source of truth; this exists so editors and non-TypeScript
 * consumers can validate `data/entries/*.yaml` and the phonology data files
 * without running our tooling.
 */

mkdirSync(DIST_DIR, { recursive: true })
emitAllSchemas((filename, contents) => {
  const path = join(DIST_DIR, filename)
  writeFileSync(path, contents)
  console.log(`wrote ${path}`)
})
