import { describe, expect, it } from 'vitest'

import {
  extractPengimPrefix,
  extractTranscription,
  importLinguaLibre,
  PARENT_CATEGORY,
  SUBCATEGORY,
  type CommonsCategoryPage,
  type CommonsFileInfo,
} from '../src/importers/lingualibre.js'

describe('extractTranscription', () => {
  it('strips the File: prefix, the LL-Q36759-<uploader>- prefix, and the extension', () => {
    expect(extractTranscription('File:LL-Q36759-Austin_Zhang-bhua5.wav', 'Austin_Zhang')).toBe('bhua5')
  })

  it('handles a transcription that itself contains hyphens and extra text', () => {
    const title = "File:LL-Q36759-Doulaisung-bhi7 jui2 沬水 -nager (sous l'eau)-.wav"
    expect(extractTranscription(title, 'Doulaisung')).toBe("bhi7 jui2 沬水 -nager (sous l'eau)-")
  })

  it("uses the authoritative uploader rather than splitting on the filename's first hyphen — a hyphenated username would otherwise be cut short", () => {
    const title = 'File:LL-Q36759-Jean-Pierre-dio5.wav'
    expect(extractTranscription(title, 'Jean-Pierre')).toBe('dio5')
  })

  it('returns null for a filename that does not match the LL-Q36759-<uploader>- convention', () => {
    expect(extractTranscription('File:zh-nan-czhu-someword.ogg', 'SomeUser')).toBeNull()
  })

  it('returns null when the uploader does not match the filename at all', () => {
    expect(extractTranscription('File:LL-Q36759-Austin_Zhang-bhua5.wav', 'SomeoneElse')).toBeNull()
  })
})

describe('extractPengimPrefix', () => {
  it('takes the whole transcription when it is already just Peng\'im', () => {
    expect(extractPengimPrefix('bhua5')).toEqual({ pengim: 'bhua5', syllableCount: 1 })
  })

  it('takes a multi-syllable prefix and stops at the first token that fails to parse', () => {
    expect(extractPengimPrefix('dio5 ziu1 沬水 extra')).toEqual({
      pengim: 'dio5 ziu1',
      syllableCount: 2,
    })
  })

  it("stops after one syllable when a later token isn't valid Peng'im under this project's scheme — a real corpus example ('jui2' has no recognised nucleus here), not a parser bug", () => {
    expect(extractPengimPrefix("bhi7 jui2 沬水 -nager (sous l'eau)-")).toEqual({
      pengim: 'bhi7',
      syllableCount: 1,
    })
  })

  it('returns null when even the first token fails to parse', () => {
    expect(extractPengimPrefix('notpengim')).toBeNull()
  })
})

const AUSTIN_TITLE = 'File:LL-Q36759-Austin_Zhang-bhua5.wav'
const DOULAISUNG_TITLE = "File:LL-Q36759-Doulaisung-bhi7 jui2 沬水 -nager (sous l'eau)-.wav"
const CHAOZHOU_WORD_TITLE = 'File:LL-Q36759-Someone2-dio5 ziu1 潮州.wav'
const MISMATCH_LICENCE_TITLE = 'File:LL-Q36759-Someone-dio5.wav'
const OLD_CONVENTION_TITLE = 'File:zh-nan-czhu-someword.ogg'
const MISSING_INFO_TITLE = 'File:LL-Q36759-Ghost-ziu1.wav'
const UNPARSEABLE_TITLE = 'File:LL-Q36759-Someone-notpengim.wav'

describe('importLinguaLibre', () => {
  const categories: Record<string, string[]> = {
    [SUBCATEGORY]: [
      AUSTIN_TITLE,
      DOULAISUNG_TITLE,
      CHAOZHOU_WORD_TITLE,
      MISMATCH_LICENCE_TITLE,
      MISSING_INFO_TITLE,
      UNPARSEABLE_TITLE,
    ],
    [PARENT_CATEGORY]: [DOULAISUNG_TITLE, OLD_CONVENTION_TITLE],
  }
  const fetchCategoryPage = async (category: string): Promise<CommonsCategoryPage> => ({
    titles: categories[category] ?? [],
    cmcontinue: null,
  })

  const fileInfo: Record<string, CommonsFileInfo> = {
    [AUSTIN_TITLE]: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/LL-Q36759-Austin_Zhang-bhua5.wav',
      licence: 'CC BY-SA 4.0',
      user: 'Austin_Zhang',
      timestamp: '2026-01-15T00:00:00Z',
    },
    [DOULAISUNG_TITLE]: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/y/yy/LL-Q36759-Doulaisung-bhi7.wav',
      licence: 'CC BY-SA 4.0',
      user: 'Doulaisung',
      timestamp: '2026-02-01T00:00:00Z',
      description: 'Puning-Chaoyang mixed accent',
    },
    [CHAOZHOU_WORD_TITLE]: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/v/vv/LL-Q36759-Someone2-dio5-ziu1.wav',
      licence: 'CC BY-SA 4.0',
      user: 'Someone2',
      timestamp: '2026-02-15T00:00:00Z',
    },
    [MISMATCH_LICENCE_TITLE]: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/z/zz/LL-Q36759-Someone-dio5.wav',
      licence: 'CC BY 4.0',
      user: 'Someone',
      timestamp: '2026-03-01T00:00:00Z',
    },
    [UNPARSEABLE_TITLE]: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/w/ww/LL-Q36759-Someone-notpengim.wav',
      licence: 'CC BY-SA 4.0',
      user: 'Someone',
    },
    // MISSING_INFO_TITLE deliberately absent — simulates a category member whose imageinfo didn't resolve.
  }
  const fetchImageInfoBatch = async (titles: string[]): Promise<Map<string, CommonsFileInfo>> => {
    const out = new Map<string, CommonsFileInfo>()
    for (const t of titles) {
      const info = fileInfo[t]
      if (info) out.set(t, info)
    }
    return out
  }

  const opts = { delayMs: 0, fetchCategoryPage, fetchImageInfoBatch }

  it('proposes a single-syllable clip destined for `clips`', async () => {
    const r = await importLinguaLibre(opts)
    const p = r.proposals.find((p) => p.commonsTitle === AUSTIN_TITLE)
    expect(p).toMatchObject({
      pengim: 'bhua5',
      syllableCount: 1,
      speaker: 'Austin_Zhang',
      licence: 'CC-BY-SA-4.0',
    })
  })

  it('stops at the syllable the scheme can actually parse, still carrying trailing hanzi and an accent note through', async () => {
    // 'jui2' has no recognised nucleus in this project's scheme, so only 'bhi7' resolves — a real corpus example, not a bug.
    const r = await importLinguaLibre(opts)
    const p = r.proposals.find((p) => p.commonsTitle === DOULAISUNG_TITLE)
    expect(p).toMatchObject({
      pengim: 'bhi7',
      syllableCount: 1,
      hanzi: '沬水',
      accentNote: 'Puning-Chaoyang mixed accent',
    })
  })

  it('proposes a multi-syllable clip destined for `wordClips`, carrying hanzi through', async () => {
    const r = await importLinguaLibre(opts)
    const p = r.proposals.find((p) => p.commonsTitle === CHAOZHOU_WORD_TITLE)
    expect(p).toMatchObject({
      pengim: 'dio5 ziu1',
      syllableCount: 2,
      hanzi: '潮州',
      speaker: 'Someone2',
    })
  })

  it('dedupes a file listed under both the subcategory and the parent category', async () => {
    const r = await importLinguaLibre(opts)
    expect(r.proposals.filter((p) => p.commonsTitle === DOULAISUNG_TITLE)).toHaveLength(1)
  })

  it('flags, but still proposes, a clip whose licence metadata is not CC-BY-SA-4.0', async () => {
    const r = await importLinguaLibre(opts)
    const p = r.proposals.find((p) => p.commonsTitle === MISMATCH_LICENCE_TITLE)
    expect(p?.licence).toBe('CC BY 4.0')
    expect(p?.flags?.[0]).toContain('expected CC-BY-SA-4.0')
  })

  it('misses a file using the older zh-nan-czhu naming convention rather than guessing', async () => {
    const r = await importLinguaLibre(opts)
    expect(r.misses).toContain(OLD_CONVENTION_TITLE)
  })

  it('misses a category member whose imageinfo never resolved', async () => {
    const r = await importLinguaLibre(opts)
    expect(r.misses).toContain(MISSING_INFO_TITLE)
  })

  it('misses a file whose transcription does not parse as Peng\'im', async () => {
    const r = await importLinguaLibre(opts)
    expect(r.misses).toContain(UNPARSEABLE_TITLE)
  })

  it('respects a limit for a spot-check run', async () => {
    const r = await importLinguaLibre({ ...opts, limit: 1 })
    expect(r.proposals.length + r.misses.length).toBe(1)
  })

  it('summarises single- vs. multi-syllable counts in notes', async () => {
    const r = await importLinguaLibre(opts)
    expect(r.notes.join(' ')).toMatch(/single-syllable.*multi-syllable/u)
  })
})
