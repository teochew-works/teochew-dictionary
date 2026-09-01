import { z } from 'zod'

import { listVarieties } from '../phonology/load.js'
import {
  DEFAULT_VARIETY,
  entryFileSchema,
  audioSchema,
  pengimSchemeSchema,
  pojSchema,
  sandhiSchema,
  varietySchema,
} from '@teochew/core'
import { externalChartSchema, syllableInventorySchema } from './inventory.js'

/** Reproduces `zod-to-json-schema`'s `name` option: `{ $ref: '#/definitions/name', definitions: { name: ... } }`. */
function namedJsonSchema(
  schema: z.ZodType,
  name: string,
  overrideFn?: (path: (string | number)[], jsonSchema: Record<string, unknown>) => void,
): object {
  const inner = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input', // pre-transform shape (e.g. checksum's regex, not its lowercased output) — transforms alone can't be represented in JSON Schema
    override: overrideFn ? (ctx) => overrideFn(ctx.path, ctx.jsonSchema) : undefined,
  })
  return { $ref: `#/definitions/${name}`, definitions: { [name]: inner } }
}

/**
 * Where `reading.variety` lands in `entryFileSchema`'s generated JSON Schema,
 * relative to its own root (see `namedJsonSchema`). Zod itself only knows this
 * field is a string — the set of legal variety ids is filesystem-derived
 * (`listVarieties()`), so it can't be a static `z.enum` without coupling
 * schema definition to directory contents at module-load time. Injected here
 * instead, into the generated artifact only.
 */
const VARIETY_PATH = 'properties/entries/items/properties/readings/items/properties/variety'

function entryFileJsonSchema(): object {
  const varietyIds = listVarieties()
  return namedJsonSchema(entryFileSchema, 'TeochewEntryFile', (path, jsonSchema) => {
    if (path.join('/') === VARIETY_PATH) {
      Object.assign(jsonSchema, { type: 'string', enum: varietyIds, default: DEFAULT_VARIETY })
    }
  })
}

const SCHEMA_EMISSIONS: Array<{ filename: string; build: () => object }> = [
  { filename: 'schema.json', build: entryFileJsonSchema },
  { filename: 'pengim-schema.json', build: () => namedJsonSchema(pengimSchemeSchema, 'PengimScheme') },
  { filename: 'poj-schema.json', build: () => namedJsonSchema(pojSchema, 'PojScheme') },
  { filename: 'variety-schema.json', build: () => namedJsonSchema(varietySchema, 'Variety') },
  { filename: 'sandhi-schema.json', build: () => namedJsonSchema(sandhiSchema, 'SandhiTable') },
  {
    filename: 'external-chart-schema.json',
    build: () => namedJsonSchema(externalChartSchema, 'ExternalChart'),
  },
  { filename: 'audio-schema.json', build: () => namedJsonSchema(audioSchema, 'Audio') },
  {
    filename: 'syllable-inventory-schema.json',
    build: () => namedJsonSchema(syllableInventorySchema, 'SyllableInventory'),
  },
]

/** Emit every schema in `src/schema/` as JSON Schema, via `writeFile(filename, contents)`. */
export function emitAllSchemas(writeFile: (filename: string, contents: string) => void): void {
  for (const { filename, build } of SCHEMA_EMISSIONS) {
    writeFile(filename, JSON.stringify(build(), null, 2))
  }
}
