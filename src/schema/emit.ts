import { ignoreOverride, zodToJsonSchema } from 'zod-to-json-schema'

import { listVarieties } from '../phonology/load.js'
import { DEFAULT_VARIETY, entryFileSchema } from './entry.js'
import {
  audioSchema,
  pengimSchemeSchema,
  pojSchema,
  sandhiSchema,
  varietySchema,
} from './phonology.js'
import { externalChartSchema, syllableInventorySchema } from './inventory.js'

/**
 * Where `reading.variety` lands in `entryFileSchema`'s generated JSON Schema.
 * Zod itself only knows this field is a string — the set of legal variety ids
 * is filesystem-derived (`listVarieties()`), so it can't be a static `z.enum`
 * without coupling schema definition to directory contents at module-load
 * time. Injected here instead, into the generated artifact only.
 */
const VARIETY_PATH =
  '#/definitions/TeochewEntryFile/properties/entries/items/properties/readings/items/properties/variety'

function entryFileJsonSchema(): object {
  const varietyIds = listVarieties()
  return zodToJsonSchema(entryFileSchema, {
    name: 'TeochewEntryFile',
    override: (_def, refs) => {
      if (refs.currentPath.join('/') === VARIETY_PATH) {
        return { type: 'string', enum: varietyIds, default: DEFAULT_VARIETY }
      }
      return ignoreOverride
    },
  })
}

const SCHEMA_EMISSIONS: Array<{ filename: string; build: () => object }> = [
  { filename: 'schema.json', build: entryFileJsonSchema },
  { filename: 'pengim-schema.json', build: () => zodToJsonSchema(pengimSchemeSchema, 'PengimScheme') },
  { filename: 'poj-schema.json', build: () => zodToJsonSchema(pojSchema, 'PojScheme') },
  { filename: 'variety-schema.json', build: () => zodToJsonSchema(varietySchema, 'Variety') },
  { filename: 'sandhi-schema.json', build: () => zodToJsonSchema(sandhiSchema, 'SandhiTable') },
  {
    filename: 'external-chart-schema.json',
    build: () => zodToJsonSchema(externalChartSchema, 'ExternalChart'),
  },
  { filename: 'audio-schema.json', build: () => zodToJsonSchema(audioSchema, 'Audio') },
  {
    filename: 'syllable-inventory-schema.json',
    build: () => zodToJsonSchema(syllableInventorySchema, 'SyllableInventory'),
  },
]

/** Emit every schema in `src/schema/` as JSON Schema, via `writeFile(filename, contents)`. */
export function emitAllSchemas(writeFile: (filename: string, contents: string) => void): void {
  for (const { filename, build } of SCHEMA_EMISSIONS) {
    writeFile(filename, JSON.stringify(build(), null, 2))
  }
}
