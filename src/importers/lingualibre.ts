import { tryParsePengim } from '../phonology/syllable.js'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import type { AudioClipProposal, AudioImportResult } from './audio-types.js'

/**
 * Lingua Libre / Wikimedia Commons audio importer (issue #106).
 *
 * Unlike `./wiktionary.js`, Commons' `list=categorymembers` gives an exact
 * enumeration of every file in a category, so there is no CirrusSearch-style
 * offset cap or wordlist/cache split to worry about — one fetch pass covers
 * the whole corpus:
 *
 *   1. Enumerate every file under the Lingua Libre subcategory, plus the
 *      older `zh-nan-czhu`-convention files filed directly under the parent
 *      category (deduped against the subcategory).
 *   2. Batch-fetch each file's `imageinfo` (direct URL, licence, uploader,
 *      upload date, description) — MediaWiki accepts multiple `titles=`
 *      per request.
 *   3. Recover a Peng'im transcription from the filename. A Lingua Libre
 *      filename is `LL-Q36759-<uploader>-<transcription>.<ext>`; the
 *      uploader segment is taken from `imageinfo.user` (authoritative)
 *      rather than guessed from the filename itself, since a username can
 *      itself contain a hyphen and a blind first-hyphen split would cut it
 *      short.
 *   4. `<transcription>` is free text — some files carry stray hanzi/gloss
 *      text after the Peng'im (see the issue's own
 *      `bhi7 jui2 沬水 -nager (sous l'eau)-` example). Rather than guess a
 *      character class, `extractPengimPrefix` reuses `tryParsePengim` — the
 *      same parser `checkAudio`/`deriveReadingWordAudio` trust — to find the
 *      longest whitespace-token prefix that actually parses as Peng'im, and
 *      stops there.
 *
 * Proposals are staged, never merged (`./audio-staging.js`, mirroring the
 * "importers never write to data/entries/" rule in ./types.js): this
 * importer does not classify variety/accent, does not re-host bytes, and
 * does not decide `clips` vs `wordClips` beyond recording `syllableCount` —
 * see data/phonology/REVIEW.md § 16.
 */

const API = 'https://commons.wikimedia.org/w/api.php'

/** Same budget `wiktionary.ts` uses for the same Wikimedia infrastructure. */
const FETCH_TIMEOUT_MS = 30_000

export const SUBCATEGORY = 'Category:Lingua Libre pronunciation-other (Q36759)'
export const PARENT_CATEGORY = 'Category:Teochew pronunciation'
export const LINGUALIBRE_SOURCE = 'lingualibre'

const CATEGORY_PAGE_SIZE = 500
/** MediaWiki's default multi-value limit for unauthenticated/non-bot requests. */
const IMAGEINFO_BATCH_SIZE = 50

const EXPECTED_LICENCE = 'CC-BY-SA-4.0'

// ─── Category enumeration ───────────────────────────────────────────────

export interface CommonsCategoryPage {
  titles: string[]
  /** Continuation token for the next page, or null when this was the last one. */
  cmcontinue: string | null
}

async function requestCategoryPage(category: string, cmcontinue?: string): Promise<CommonsCategoryPage> {
  const url = new URL(API)
  const params: Record<string, string> = {
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
    cmtype: 'file',
    cmlimit: String(CATEGORY_PAGE_SIZE),
    format: 'json',
    formatversion: '2',
  }
  if (cmcontinue) params.cmcontinue = cmcontinue
  url.search = new URLSearchParams(params).toString()

  const res = await fetchWithRetry(
    url,
    { headers: { 'user-agent': IMPORTER_USER_AGENT } },
    { timeoutMs: FETCH_TIMEOUT_MS },
  )
  if (!res.ok) throw new Error(`Commons categorymembers API returned ${res.status} for ${category}`)

  const body = (await res.json()) as {
    error?: { code?: string; info?: string }
    continue?: { cmcontinue?: string }
    query?: { categorymembers?: { title: string }[] }
  }
  if (body.error) {
    throw new Error(`Commons categorymembers API error for ${category}: ${body.error.code} — ${body.error.info}`)
  }

  return {
    titles: (body.query?.categorymembers ?? []).map((m) => m.title),
    cmcontinue: body.continue?.cmcontinue ?? null,
  }
}

export interface FetchCategoryOptions {
  /** Milliseconds between page requests. Wikimedia asks clients to be gentle. */
  delayMs?: number
  /** Injectable for tests. */
  fetchCategoryPage?: (category: string, cmcontinue?: string) => Promise<CommonsCategoryPage>
}

/** Pages through a whole category's file members via `cmcontinue`. */
export async function fetchAllCategoryMembers(
  category: string,
  options: FetchCategoryOptions = {},
): Promise<string[]> {
  const { delayMs = 200, fetchCategoryPage = requestCategoryPage } = options

  const titles: string[] = []
  let cmcontinue: string | undefined
  let first = true

  for (;;) {
    if (!first && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    first = false

    const page = await fetchCategoryPage(category, cmcontinue)
    titles.push(...page.titles)
    if (!page.cmcontinue) break
    cmcontinue = page.cmcontinue
  }

  return titles
}

// ─── Per-file metadata ──────────────────────────────────────────────────

export interface CommonsFileInfo {
  url: string
  licence?: string
  user?: string
  timestamp?: string
  description?: string
}

async function requestImageInfoBatch(titles: string[]): Promise<Map<string, CommonsFileInfo>> {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|user|timestamp',
    format: 'json',
    formatversion: '2',
  }).toString()

  const res = await fetchWithRetry(
    url,
    { headers: { 'user-agent': IMPORTER_USER_AGENT } },
    { timeoutMs: FETCH_TIMEOUT_MS },
  )
  if (!res.ok) throw new Error(`Commons imageinfo API returned ${res.status}`)

  const body = (await res.json()) as {
    error?: { code?: string; info?: string }
    query?: {
      pages?: {
        title: string
        imageinfo?: {
          url: string
          user?: string
          timestamp?: string
          extmetadata?: Record<string, { value?: string }>
        }[]
      }[]
    }
  }
  if (body.error) throw new Error(`Commons imageinfo API error: ${body.error.code} — ${body.error.info}`)

  const out = new Map<string, CommonsFileInfo>()
  for (const page of body.query?.pages ?? []) {
    const info = page.imageinfo?.[0]
    if (!info) continue
    out.set(page.title, {
      url: info.url,
      licence: info.extmetadata?.LicenseShortName?.value,
      user: info.user,
      timestamp: info.timestamp,
      description: info.extmetadata?.ImageDescription?.value,
    })
  }
  return out
}

export interface FetchImageInfoOptions {
  /** Milliseconds between batch requests. */
  delayMs?: number
  /** Injectable for tests. */
  fetchImageInfoBatch?: (titles: string[]) => Promise<Map<string, CommonsFileInfo>>
}

/** Batches `titles` (≤50 per request, MediaWiki's own limit) and merges the results. */
export async function fetchAllImageInfo(
  titles: string[],
  options: FetchImageInfoOptions = {},
): Promise<Map<string, CommonsFileInfo>> {
  const { delayMs = 200, fetchImageInfoBatch = requestImageInfoBatch } = options

  const out = new Map<string, CommonsFileInfo>()
  let first = true

  for (let i = 0; i < titles.length; i += IMAGEINFO_BATCH_SIZE) {
    if (!first && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    first = false

    const batch = titles.slice(i, i + IMAGEINFO_BATCH_SIZE)
    const info = await fetchImageInfoBatch(batch)
    for (const [title, fileInfo] of info) out.set(title, fileInfo)
  }

  return out
}

// ─── Filename / transcription parsing ──────────────────────────────────

const FILE_PREFIX = 'File:'
const NAME_PREFIX = 'LL-Q36759-'
const AUDIO_EXT = /\.(wav|ogg|oga|flac|mp3)$/iu

/**
 * Recovers the `<transcription>` segment of an
 * `LL-Q36759-<uploader>-<transcription>.<ext>` filename. Uses the uploader
 * string already fetched from `imageinfo.user` to strip the exact prefix,
 * rather than splitting the filename on its first hyphen — a username can
 * itself contain a hyphen (e.g. "Jean-Pierre"), which a blind split would
 * cut short. Returns null for the older `zh-nan-czhu`-convention files
 * (filed directly under the parent category) — a different, unsupported
 * naming pattern; those are reported as misses, not silently mis-parsed.
 */
export function extractTranscription(title: string, uploader: string): string | null {
  const name = title.startsWith(FILE_PREFIX) ? title.slice(FILE_PREFIX.length) : title
  const withoutExt = name.replace(AUDIO_EXT, '')
  const prefix = `${NAME_PREFIX}${uploader}-`
  if (!withoutExt.startsWith(prefix)) return null
  return withoutExt.slice(prefix.length)
}

/**
 * Finds the longest whitespace-token prefix of `transcription` that parses
 * as valid Peng'im, using `tryParsePengim` itself rather than a hand-rolled
 * character class — trailing hanzi/gloss text (see module doc comment)
 * reliably fails to parse and so is left in the (discarded) remainder.
 * Returns null when even the first token fails to parse.
 */
export function extractPengimPrefix(transcription: string): { pengim: string; syllableCount: number } | null {
  const tokens = transcription.trim().split(/\s+/u).filter(Boolean)

  let best: { pengim: string; syllableCount: number } | null = null
  for (let n = 1; n <= tokens.length; n += 1) {
    const candidate = tokens.slice(0, n).join(' ')
    const parsed = tryParsePengim(candidate)
    if (!parsed.ok) break
    best = { pengim: candidate, syllableCount: parsed.syllables.length }
  }
  return best
}

/** First run of CJK ideographs in the transcription's post-Peng'im remainder, if any. */
function extractHanzi(remainder: string): string | undefined {
  return remainder.match(/[㐀-䶿一-鿿]+/u)?.[0]
}

/** Commons reports e.g. "CC BY-SA 4.0" — normalise to this project's licence-id spelling. */
function normaliseLicence(raw: string | undefined): string {
  if (!raw) return 'unknown'
  const compact = raw.trim().replace(/\s+/gu, '-').toUpperCase()
  return compact === EXPECTED_LICENCE ? EXPECTED_LICENCE : raw.trim()
}

// ─── Top-level import ───────────────────────────────────────────────────

export interface LinguaLibreOptions {
  delayMs?: number
  fetchCategoryPage?: (category: string, cmcontinue?: string) => Promise<CommonsCategoryPage>
  fetchImageInfoBatch?: (titles: string[]) => Promise<Map<string, CommonsFileInfo>>
  /** Caps how many titles are processed — for a spot-check run against the live API. */
  limit?: number
}

export async function importLinguaLibre(options: LinguaLibreOptions = {}): Promise<AudioImportResult> {
  const { delayMs, fetchCategoryPage, fetchImageInfoBatch, limit } = options

  const [subcategoryTitles, parentTitles] = await Promise.all([
    fetchAllCategoryMembers(SUBCATEGORY, { delayMs, fetchCategoryPage }),
    fetchAllCategoryMembers(PARENT_CATEGORY, { delayMs, fetchCategoryPage }),
  ])

  const seen = new Set(subcategoryTitles)
  const allTitles = [...subcategoryTitles, ...parentTitles.filter((t) => !seen.has(t))]
  const titles = limit !== undefined ? allTitles.slice(0, limit) : allTitles

  const info = await fetchAllImageInfo(titles, { delayMs, fetchImageInfoBatch })

  const proposals: AudioClipProposal[] = []
  const misses: string[] = []
  let missingInfo = 0
  let unknownFilenamePattern = 0
  let unparsedTranscription = 0
  let licenceMismatches = 0

  for (const title of titles) {
    const fileInfo = info.get(title)
    if (!fileInfo || !fileInfo.user) {
      missingInfo += 1
      misses.push(title)
      continue
    }

    const transcription = extractTranscription(title, fileInfo.user)
    if (transcription === null) {
      unknownFilenamePattern += 1
      misses.push(title)
      continue
    }

    const extracted = extractPengimPrefix(transcription)
    if (!extracted) {
      unparsedTranscription += 1
      misses.push(title)
      continue
    }

    const remainder = transcription.slice(extracted.pengim.length)
    const hanzi = extractHanzi(remainder)
    const accentNote = fileInfo.description?.trim()

    const licence = normaliseLicence(fileInfo.licence)
    const flags: string[] = []
    if (licence !== EXPECTED_LICENCE) {
      licenceMismatches += 1
      flags.push(
        `licence metadata says '${fileInfo.licence ?? 'unknown'}', expected ${EXPECTED_LICENCE} — verify before merging`,
      )
    }

    proposals.push({
      pengim: extracted.pengim,
      syllableCount: extracted.syllableCount,
      ...(hanzi ? { hanzi } : {}),
      commonsTitle: title,
      commonsUrl: fileInfo.url,
      speaker: fileInfo.user,
      licence,
      ...(fileInfo.timestamp ? { uploadDate: fileInfo.timestamp.slice(0, 10) } : {}),
      ...(accentNote ? { accentNote } : {}),
      ...(flags.length > 0 ? { flags } : {}),
    })
  }

  const singleSyllable = proposals.filter((p) => p.syllableCount === 1).length
  const multiSyllable = proposals.length - singleSyllable

  return {
    source: LINGUALIBRE_SOURCE,
    proposals,
    misses,
    notes: [
      `found ${allTitles.length} file(s) across '${SUBCATEGORY}' and '${PARENT_CATEGORY}', processed ${titles.length}`,
      `resolved ${proposals.length} proposal(s): ${singleSyllable} single-syllable (→ clips), ${multiSyllable} multi-syllable (→ wordClips)`,
      `${misses.length} miss(es): ${unknownFilenamePattern} unrecognised filename pattern, ${unparsedTranscription} transcription did not parse as Peng'im, ${missingInfo} missing imageinfo`,
      `${licenceMismatches} proposal(s) flagged for a licence mismatch — verify manually before merging`,
      'Lingua Libre / Commons audio is CC-BY-SA-4.0 — merging binds the dataset to share-alike, same as wiktionary',
    ],
  }
}
