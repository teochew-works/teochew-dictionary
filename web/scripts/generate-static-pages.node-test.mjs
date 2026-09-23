import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entryKey, entryPath } from '../shared/publicUrls.mjs'
import { generate, eligibleEntries } from './generate-static-pages.mjs'
import { validate } from './validate-static-pages.mjs'

const origin = 'https://example.test'
function entry(id, headword = '潮州') {
  return { id, headword, readings: [{ pengim: 'dio5', poj: 'tiô', variety: 'chaozhou', ipa_caveats: [] }], senses: [{ pos: 'noun', gloss_en: ['<a & b>'] }], licence: 'CC-BY-4.0', attributions: ['A "quote"'], sources: ['fixture'] }
}

test('entry keys preserve distinct Unicode and reserved IDs safely', () => {
  const ids = ['潮州', '潮州/', 'a%2Fb', 'a/b', 'ê', 'e\u0302', 'A', 'a']
  const keys = ids.map(entryKey)
  assert.equal(new Set(keys).size, ids.length)
  for (const key of keys) assert.match(key, /^e-[0-9a-f]+$/)
  assert.equal(entryPath('潮州/', '/teochew-dictionary/'), `/teochew-dictionary/entry/${entryKey('潮州/')}/`)
})

test('generation escapes content, cleans stale pages, and validates both bases', () => {
  for (const base of ['/', '/teochew-dictionary/']) {
    const dir = mkdtempSync(join(tmpdir(), 'teochew-static-'))
    try {
      mkdirSync(join(dir, 'entry', 'stale'), { recursive: true })
      writeFileSync(join(dir, 'entry', 'stale', 'index.html'), 'stale')
      writeFileSync(join(dir, 'index.html'), `<html><head><link rel="canonical" href="${origin}${base}"></head><body><aside><a href="${base}browse/1/">Browse all dictionary entries</a></aside><div id="root"></div></body></html>`)
      const dict = { entries: [entry('a/b', '<bad>'), { ...entry('hidden'), hidden: true }] }
      const result = generate({ dict, dist: dir, base, origin })
      assert.deepEqual(result.excluded, { hidden: 1, incomplete: 0 })
      validate({ dict, dist: dir, base, origin })
      const html = readFileSync(join(dir, 'entry', entryKey('a/b'), 'index.html'), 'utf8')
      assert.match(html, /&lt;bad&gt;/)
      assert.match(html, /&lt;a &amp; b&gt;/)
      assert.doesNotMatch(html, /<bad>|<a & b>/)
      assert.match(html, /rel="canonical" href="https:\/\/example.test\//)
      assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /Browse all dictionary entries/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('duplicate IDs fail before writing pages', () => {
  assert.throws(() => eligibleEntries({ entries: [entry('same'), entry('same')] }), /duplicate/)
})
