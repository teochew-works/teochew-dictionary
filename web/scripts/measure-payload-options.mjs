import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

// Size experiment only. Do not ship this projection as an API: study and
// pronunciation consumers require metadata intentionally omitted here.
const source = readFileSync(new URL('../../dist/dict.json', import.meta.url))
const data = JSON.parse(source)
function size(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  return { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
}
const projection = data.entries.map(entry => ({
  id: entry.id, headword: entry.headword, hidden: entry.hidden,
  level: entry.level, search_keys: entry.search_keys,
  gloss: entry.senses[0]?.gloss_en,
  pronunciation: entry.readings[0]?.pengim,
}))
const index = size(projection)
const shardSizes = [64, 128, 256].map(entriesPerShard => {
  const shards = []
  for (let offset = 0; offset < data.entries.length; offset += entriesPerShard) {
    shards.push(size(data.entries.slice(offset, offset + entriesPerShard)))
  }
  const gzipBytes = shards.reduce((total, shard) => total + shard.gzipBytes, 0)
  return {
    entriesPerShard, count: shards.length, gzipBytes,
    maxShardGzipBytes: Math.max(...shards.map(shard => shard.gzipBytes)),
    totalWithIndexGzipBytes: gzipBytes + index.gzipBytes,
  }
})
console.log(JSON.stringify({
  sha256: createHash('sha256').update(source).digest('hex'),
  original: { bytes: source.length, gzipBytes: gzipSync(source).length },
  minified: size(data), projectedIndex: index, shardSizes,
  limitations: [
    'Size-only projection, not a complete search/filter/study artifact.',
    'No browser fetch, worker transfer, rendering or device benchmark.',
    'Shard sizes exclude manifest, HTTP headers and cache/version management.',
    'Original source order determines shard membership; not a stable production format.',
  ],
}, null, 2))
