#!/usr/bin/env node
// Copies the repo root's built dist/dict.json and dist/sounds.json into
// web/public/data/, where the app fetches them at runtime as static assets.
// Run automatically via the predev/prebuild npm scripts — see web/README.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '../../dist')
const DEST_DIR = join(__dirname, '../public/data')

function sync(filename, validate) {
  const src = join(DIST_DIR, filename)
  const dest = join(DEST_DIR, filename)

  if (!existsSync(src)) {
    console.error(`no ${filename} at ${src} — run \`npm run build\` in the repo root first`)
    process.exit(1)
  }

  mkdirSync(DEST_DIR, { recursive: true })
  copyFileSync(src, dest)

  const parsed = JSON.parse(readFileSync(dest, 'utf8'))
  validate(parsed, dest)
}

sync('dict.json', ({ meta }, dest) => {
  if (!meta || typeof meta.entry_count !== 'number') {
    console.error(`${dest} doesn't look like a dist/dict.json (missing meta.entry_count)`)
    process.exit(1)
  }
  console.log(`synced ${meta.entry_count} entries → web/public/data/dict.json`)
})

sync('sounds.json', ({ sounds }, dest) => {
  if (!Array.isArray(sounds)) {
    console.error(`${dest} doesn't look like a dist/sounds.json (missing sounds array)`)
    process.exit(1)
  }
  console.log(`synced ${sounds.length} sounds → web/public/data/sounds.json`)
})
