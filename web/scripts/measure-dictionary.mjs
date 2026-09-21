import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { cpus, platform, arch } from 'node:os'
import Fuse from 'fuse.js'

// Offline desktop proxy. Browser fetch/decode, rendering and device memory
// must be measured separately; this is not a mobile performance claim.
const bytes = readFileSync(new URL('../../dist/dict.json', import.meta.url))
const text = bytes.toString('utf8')
let start = performance.now()
const data = JSON.parse(text)
const parseMs = performance.now() - start
const entries = data.entries.filter(entry => !entry.hidden)
start = performance.now()
const index = new Fuse(entries, {
  keys: [{ name: 'headword', weight: 3 }, { name: 'search_keys', weight: 1 }],
  threshold: 0.2, ignoreLocation: true,
})
const indexMs = performance.now() - start
const queries = ['潮州', 'eat', 'wood', 'dio5 ziu1', 'vegtable'].map(query => {
  const samples = []
  let count = 0
  for (let n = 0; n < 10; n++) {
    const before = performance.now()
    count = index.search(query).length
    samples.push(performance.now() - before)
  }
  samples.sort((a, b) => a - b)
  return { query, count, medianMs: samples[5], maxMs: samples[9] }
})
console.log(JSON.stringify({
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length, gzipBytes: gzipSync(bytes).length,
  entries: entries.length, parseMs, indexMs, queries,
  memorySnapshotBytes: process.memoryUsage(),
  limitation: 'Node desktop proxy; Fuse timings exclude application reranking and rendering; memory is a snapshot, not peak.',
}, null, 2))
