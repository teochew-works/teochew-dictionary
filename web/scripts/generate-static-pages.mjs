#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryPath, browsePath, entryKey, siteBase } from '../shared/publicUrls.mjs'

const webDir = dirname(dirname(fileURLToPath(import.meta.url)))
const PAGE_SIZE = 200
const STYLES = `:root{color-scheme:light dark;font:1rem/1.5 system-ui,sans-serif}body{max-width:50rem;margin:0 auto;padding:1rem 1.5rem}a{color:#a63d2f}header,footer{padding:.5rem 0;border-bottom:1px solid #888}footer{border-top:1px solid #888;border-bottom:0;margin-top:2rem}h1{line-height:1.25}section{margin:1.5rem 0}.reading,.sense{padding:.5rem 0;border-top:1px solid #888}.muted{opacity:.75}.browse-list{columns:2;padding-left:1.5rem}.browse-list li{break-inside:avoid;margin:.2rem 0}@media(max-width:640px){.browse-list{columns:1}}@media(prefers-color-scheme:dark){a{color:#e08a75}}`

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function absolute(path, origin) {
  return new URL(path, origin).href
}

function pageHtml({ title, description, canonical, content, image }) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">\n<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image">\n<style>${STYLES}</style></head><body>${content}</body></html>\n`
}

function list(items, className = '') {
  return `<ul${className ? ` class="${className}"` : ''}>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
}

export function eligibleEntries(dict) {
  const excluded = { hidden: 0, incomplete: 0 }
  const seenIds = new Set()
  const seenKeys = new Set()
  const entries = []
  for (const entry of dict.entries) {
    if (entry.hidden) { excluded.hidden++; continue }
    if (!entry.id || !entry.headword || !entry.readings?.length || !entry.senses?.some((sense) => sense.gloss_en?.length)) {
      excluded.incomplete++
      continue
    }
    const key = entryKey(entry.id)
    if (seenIds.has(entry.id) || seenKeys.has(key)) throw new Error(`duplicate entry ID or key: ${entry.id}`)
    seenIds.add(entry.id)
    seenKeys.add(key)
    entries.push(entry)
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return { entries, excluded }
}

export function renderEntry(entry, page, base, origin) {
  const path = entryPath(entry.id, base)
  const canonical = absolute(path, origin)
  const gloss = entry.senses[0].gloss_en.join(', ')
  const title = `${entry.headword} (${entry.readings[0].pengim}) — Teochew Dictionary`
  const description = `${entry.headword}: ${gloss}. Teochew pronunciation: ${entry.readings[0].pengim}.`
  const readings = entry.readings.map((r) => `<div class="reading"><strong>Peng'im: ${escapeHtml(r.pengim)}</strong>${r.poj ? `<br>POJ: ${escapeHtml(r.poj)}` : ''}${r.variety ? `<br><span class="muted">Variety: ${escapeHtml(r.variety)}</span>` : ''}${r.register ? `<br><span class="muted">Register: ${escapeHtml(r.register)}</span>` : ''}${r.note ? `<p>${escapeHtml(r.note)}</p>` : ''}${(r.ipa_caveats ?? []).map((c) => `<p>Pronunciation note: ${escapeHtml(c)}</p>`).join('')}</div>`).join('')
  const senses = entry.senses.map((s) => `<div class="sense"><strong>${escapeHtml(s.pos)}:</strong> ${escapeHtml(s.gloss_en.join(', '))}${s.gloss_zh?.length ? `<br>${escapeHtml(s.gloss_zh.join(', '))}` : ''}${s.note ? `<p>${escapeHtml(s.note)}</p>` : ''}${s.tags?.length ? `<p>Usage: ${escapeHtml(s.tags.join(', '))}</p>` : ''}${s.topics?.length ? `<p>Topics: ${escapeHtml(s.topics.join(', '))}</p>` : ''}${s.alt_of?.length ? `<p>Alternate form of: ${escapeHtml(s.alt_of.join(', '))}</p>` : ''}${s.examples?.length ? `<h3>Examples</h3>${list(s.examples.map((ex) => `${escapeHtml(ex.hanzi)} (${escapeHtml(ex.pengim)}) — ${escapeHtml(ex.en)}${ex.note ? `; ${escapeHtml(ex.note)}` : ''}`))}` : ''}</div>`).join('')
  const audio = entry.readings.some((r) => r.wordAudio || r.audio?.some(Boolean))
  const appLink = `${base}#dictionary/${encodeURIComponent(entry.id)}`
  const content = `<header><a href="${base}">Teochew Dictionary</a> · <a href="${browsePath(page, base)}">Browse entries</a></header><main><h1>${escapeHtml(entry.headword)}</h1>${entry.variants?.length ? `<p>Also written: ${escapeHtml(entry.variants.join(', '))}</p>` : ''}${entry.needs_review ? '<p>This entry is flagged for review.</p>' : ''}<section><h2>Pronunciation</h2>${readings}</section><section><h2>Meanings and usage</h2>${senses}</section><p><a href="${escapeHtml(appLink)}">Open in the interactive dictionary${audio ? ' to hear available audio' : ''}</a></p></main><footer><p>Licence: ${escapeHtml(entry.licence)}. ${escapeHtml(entry.attributions.join('; '))}</p><p>Source IDs: ${escapeHtml(entry.sources.join(', '))}</p></footer>`
  return pageHtml({ title, description, canonical, content, image: absolute(`${base}og-image.png`, origin) })
}

export function renderBrowse(entries, page, pages, base, origin) {
  const path = browsePath(page, base)
  const items = entries.map((entry) => `<a href="${entryPath(entry.id, base)}">${escapeHtml(entry.headword)} — ${escapeHtml(entry.readings[0].pengim)}: ${escapeHtml(entry.senses[0].gloss_en.join(', '))}</a>`)
  const nav = `<nav>${page > 1 ? `<a href="${browsePath(page - 1, base)}">Previous</a> · ` : ''}Page ${page} of ${pages}${page < pages ? ` · <a href="${browsePath(page + 1, base)}">Next</a>` : ''}</nav>`
  const content = `<header><a href="${base}">Teochew Dictionary</a></header><main><h1>Browse Teochew entries</h1><p>Browse dictionary headwords, pronunciations, and meanings. Use the <a href="${base}#dictionary">interactive dictionary</a> to search.</p>${nav}${list(items, 'browse-list')}${nav}</main>`
  return pageHtml({ title: `Browse entries, page ${page} — Teochew Dictionary`, description: `Browse Teochew dictionary entries, page ${page} of ${pages}.`, canonical: absolute(path, origin), content, image: absolute(`${base}og-image.png`, origin) })
}

function xmlEscape(value) {
  return escapeHtml(value).replace(/&#39;/g, '&apos;')
}

function writePage(dist, path, base, html) {
  const relative = path.slice(base.length)
  const target = join(dist, relative, 'index.html')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, html)
}

export function generate({ dict, dist, base, origin }) {
  siteBase(base)
  if (!/^https:\/\/[^/]+$/u.test(origin)) throw new Error(`invalid origin: ${origin}`)
  const { entries, excluded } = eligibleEntries(dict)
  const pages = Math.ceil(entries.length / PAGE_SIZE)
  if (pages === 0) throw new Error('no eligible entries')
  // Vite has already emptied and populated dist. These removals also make
  // standalone generator reruns safe when an entry disappears.
  rmSync(join(dist, 'entry'), { recursive: true, force: true })
  rmSync(join(dist, 'browse'), { recursive: true, force: true })
  const urls = [absolute(base, origin)]
  for (let page = 1; page <= pages; page++) {
    const path = browsePath(page, base)
    writePage(dist, path, base, renderBrowse(entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, base, origin))
    urls.push(absolute(path, origin))
  }
  entries.forEach((entry, index) => {
    const path = entryPath(entry.id, base)
    writePage(dist, path, base, renderEntry(entry, Math.floor(index / PAGE_SIZE) + 1, base, origin))
    urls.push(absolute(path, origin))
  })
  if (urls.length > 50_000) throw new Error('sitemap URL limit exceeded; split sitemap')
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n`
  if (Buffer.byteLength(sitemap) > 50_000_000) throw new Error('sitemap size limit exceeded; split sitemap')
  writeFileSync(join(dist, 'sitemap.xml'), sitemap)
  const stats = { entries: entries.length, browsePages: pages, excluded, files: entries.length + pages + 2, bytes: statSync(join(dist, 'sitemap.xml')).size }
  console.log(`generated ${stats.entries} entry pages, ${stats.browsePages} browse pages; excluded ${excluded.hidden} hidden and ${excluded.incomplete} incomplete entries; sitemap ${stats.bytes} bytes`)
  return stats
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.env.GH_PAGES === 'true' ? '/teochew-dictionary/' : '/'
  const origin = process.env.SITE_ORIGIN || 'https://teochew-works.github.io'
  const dict = JSON.parse(readFileSync(join(webDir, 'public/data/dict.json'), 'utf8'))
  generate({ dict, dist: join(webDir, 'dist'), base, origin })
}
