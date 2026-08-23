import { describe, expect, it } from 'vitest'

import { extractAltOf, mapWiktextractTags, mapWiktextractTopics } from '../src/importers/wiktionary-tags.js'

describe('mapWiktextractTags', () => {
  it('passes genuine usage tags through unchanged', () => {
    expect(mapWiktextractTags(['abbreviation', 'alt-of'])).toEqual(['abbreviation', 'alt-of'])
  })

  it('drops this dictionary\'s own reading-system tags', () => {
    expect(mapWiktextractTags(['Min-Nan', 'Teochew', "Peng'im"])).toEqual([])
  })

  it('drops other Chinese topolect/language names', () => {
    expect(mapWiktextractTags(['Cantonese', 'slang'])).toEqual(['slang'])
    expect(mapWiktextractTags(['Sichuanese', 'Southwestern-Mandarin', 'including'])).toEqual(['including'])
    expect(mapWiktextractTags(['Eastern', 'Min', 'Waxiang', 'Wu', 'dialectal', 'formal', 'in-compounds'])).toEqual([
      'dialectal',
      'formal',
      'in-compounds',
    ])
  })

  it('dedupes and trims', () => {
    expect(mapWiktextractTags([' dialectal ', 'dialectal', 'obsolete'])).toEqual(['dialectal', 'obsolete'])
  })

  it('returns an empty array for undefined input', () => {
    expect(mapWiktextractTags(undefined)).toEqual([])
  })

  it('drops an unlisted capitalized tag as a presumed place/topolect name', () => {
    // Real noise from a full backfill run — never explicitly listed, and
    // exactly the kind of unbounded gazetteer a denylist can't keep up with.
    expect(mapWiktextractTags(['Guiyang', 'Zhuhai', 'Hong-Kong', 'literary'])).toEqual(['literary'])
  })

  it('recognizes a non-ASCII capital letter as a proper noun too', () => {
    // Real noise from the same run: a bare [A-Z] check missed 'Ürümqi'.
    expect(mapWiktextractTags(['Ürümqi', 'literary'])).toEqual(['literary'])
  })

  it('keeps the small set of legitimately capitalized register tags', () => {
    expect(mapWiktextractTags(['Classical', 'Classical-Chinese', 'Ancient', 'Internet', 'TV'])).toEqual([
      'Classical',
      'Classical-Chinese',
      'Ancient',
      'Internet',
      'TV',
    ])
  })

  it('drops lowercase wiktextract-internal noise despite not looking like a place name', () => {
    expect(mapWiktextractTags(['traditional', 'error-lua-timeout', 'error-unknown-tag', 'empty-gloss', 'obsolete'])).toEqual([
      'obsolete',
    ])
  })

  it('keeps the diagnostic no-gloss tag (documented in README as worth surfacing)', () => {
    expect(mapWiktextractTags(['no-gloss'])).toEqual(['no-gloss'])
  })
})

describe('mapWiktextractTopics', () => {
  it('passes topic values through unchanged, in input order', () => {
    expect(mapWiktextractTopics(['board-games', 'games', 'xiangqi'])).toEqual(['board-games', 'games', 'xiangqi'])
  })

  it('dedupes and trims', () => {
    expect(mapWiktextractTopics([' zoology ', 'zoology', 'cooking'])).toEqual(['zoology', 'cooking'])
  })

  it('drops empty/whitespace-only entries', () => {
    expect(mapWiktextractTopics(['', ' ', 'sciences'])).toEqual(['sciences'])
  })

  it('returns an empty array for undefined input', () => {
    expect(mapWiktextractTopics(undefined)).toEqual([])
  })

  it('keeps capitalized proper-noun topics, unlike mapWiktextractTags', () => {
    // Unlike `tags`, where capitalization signals place/topolect noise to
    // drop, `topics`'s capitalized values (Buddhism, Chinese-cuisine, ...)
    // are genuine domain names — wiktextract's own tags/topics split already
    // leaves this field clean, so no capitalization filter applies here.
    expect(mapWiktextractTopics(['Buddhism', 'Chinese-cuisine', 'lifestyle'])).toEqual([
      'Buddhism',
      'Chinese-cuisine',
      'lifestyle',
    ])
  })
})

describe('extractAltOf', () => {
  it('pulls the target word, dropping the extra gloss', () => {
    expect(extractAltOf([{ word: '馬祖', extra: 'Mǎzǔ, "Matsu"' }])).toEqual(['馬祖'])
  })

  it('dedupes repeated targets', () => {
    expect(extractAltOf([{ word: '林檎' }, { word: '林檎' }])).toEqual(['林檎'])
  })

  it('returns an empty array for undefined input', () => {
    expect(extractAltOf(undefined)).toEqual([])
  })
})
