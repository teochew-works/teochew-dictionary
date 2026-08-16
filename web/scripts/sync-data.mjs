#!/usr/bin/env node
// Copies the repo root's built dist/dict.json into web/public/data/, where the
// app fetches it at runtime as a static asset. Run automatically via the
// predev/prebuild npm scripts — see web/README.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '../../dist/dict.json')
const DEST_DIR = join(__dirname, '../public/data')
const DEST = join(DEST_DIR, 'dict.json')

if (!existsSync(SRC)) {
  console.error(`no dictionary at ${SRC} — run \`npm run build\` in the repo root first`)
  process.exit(1)
}

mkdirSync(DEST_DIR, { recursive: true })
copyFileSync(SRC, DEST)

const { meta } = JSON.parse(readFileSync(DEST, 'utf8'))
if (!meta || typeof meta.entry_count !== 'number') {
  console.error(`${DEST} doesn't look like a dist/dict.json (missing meta.entry_count)`)
  process.exit(1)
}

console.log(`synced ${meta.entry_count} entries → web/public/data/dict.json`)
