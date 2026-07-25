import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { DIST_DIR } from '../paths.js'
import { entryFileSchema } from '../schema/entry.js'

/**
 * `npm run schema` — emit the entry JSON Schema.
 *
 * Zod is the single source of truth; this exists so editors and non-TypeScript
 * consumers can validate `data/entries/*.yaml` without running our tooling.
 */

mkdirSync(DIST_DIR, { recursive: true })
const path = join(DIST_DIR, 'schema.json')
writeFileSync(path, JSON.stringify(zodToJsonSchema(entryFileSchema, 'TeochewEntryFile'), null, 2))
console.log(`wrote ${path}`)
