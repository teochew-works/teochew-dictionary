#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eligibleEntries } from './generate-static-pages.mjs'
import { entryPath, browsePath } from '../shared/publicUrls.mjs'

const webDir = dirname(dirname(fileURLToPath(import.meta.url)))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function htmlAt(dist, path, base) {
  return readFileSync(join(dist, path.slice(base.length), 'index.html'), 'utf8')
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name)
    return item.isDirectory() ? filesUnder(path) : [path]
  })
}

export function validate({ dict, dist, base, origin }) {
  const { entries } = eligibleEntries(dict)
  const pages = Math.ceil(entries.length / 200)
  const expectedPaths = [base, ...Array.from({ length: pages }, (_, i) => browsePath(i + 1, base)), ...entries.map((entry) => entryPath(entry.id, base))]
  const expectedUrls = expectedPaths.map((path) => new URL(path, origin).href)
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  assert(sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'invalid sitemap root')
  assert(locs.length === expectedUrls.length, 'sitemap URL count mismatch')
  assert(new Set(locs).size === locs.length, 'duplicate sitemap URLs')
  assert(expectedUrls.every((url) => locs.includes(url)), 'missing sitemap URL')
  const knownPaths = new Set(expectedPaths)
  for (const path of expectedPaths) {
    const html = htmlAt(dist, path, base)
    const canonical = new URL(path, origin).href
    assert((html.match(/rel="canonical"/g) ?? []).length === 1, `canonical count: ${path}`)
    assert(html.includes(`rel="canonical" href="${canonical}"`), `wrong canonical: ${path}`)
    assert(html.includes('<h1>') || path === base, `missing main content: ${path}`)
    for (const [, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      if (!href.startsWith(base) || href.startsWith(`${base}#`)) continue
      const linkedPath = href.split('#')[0]
      assert(knownPaths.has(linkedPath), `broken page link ${href} on ${path}`)
    }
  }
  const home = htmlAt(dist, base, base)
  assert(home.includes(`href="${browsePath(1, base)}"`), 'homepage does not link to browse index')
  for (let page = 1; page <= pages; page++) {
    const browse = htmlAt(dist, browsePath(page, base), base)
    for (const entry of entries.slice((page - 1) * 200, page * 200)) {
      assert(browse.includes(`href="${entryPath(entry.id, base)}"`), `unreachable entry: ${entry.id}`)
    }
  }
  assert(filesUnder(join(dist, 'entry')).length === entries.length, 'stale or missing entry output')
  assert(filesUnder(join(dist, 'browse')).length === pages, 'stale or missing browse output')
  const workerFile = join(dist, 'sw.js')
  if (existsSync(workerFile)) {
    const worker = readFileSync(workerFile, 'utf8')
    assert(!/url:"(?:entry|browse)\//.test(worker), 'generated corpus is precached')
    const denylist = new RegExp(`^${base}(?:entry|browse)/`).toString()
    assert(worker.includes(denylist), 'generated pages are not excluded from navigation fallback')
    const homepageRevision = createHash('md5').update(readFileSync(join(dist, 'index.html'))).digest('hex')
    assert(worker.includes(`url:"index.html",revision:"${homepageRevision}"`), 'service worker cached a stale homepage')
  }
  console.log(`validated ${entries.length} entries, ${pages} browse pages, ${locs.length} sitemap URLs and their internal links`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.env.GH_PAGES === 'true' ? '/teochew-dictionary/' : '/'
  const origin = process.env.SITE_ORIGIN || 'https://teochew-works.github.io'
  const dict = JSON.parse(readFileSync(join(webDir, 'public/data/dict.json'), 'utf8'))
  validate({ dict, dist: join(webDir, 'dist'), base, origin })
}
