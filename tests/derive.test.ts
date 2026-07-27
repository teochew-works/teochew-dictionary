import { describe, expect, it } from 'vitest'

import { toIpa } from '../src/phonology/ipa.js'
import { toPoj } from '../src/phonology/poj.js'
import { applySandhi } from '../src/phonology/sandhi.js'

describe('toIpa — Chaozhou', () => {
  it('derives the reference word 潮州', () => {
    expect(toIpa('dio5 ziu1').ipa).toBe('tie⁵⁵ tsiu³³')
  })

  it('maps the stop codas through Peng\'im\'s b/g spelling', () => {
    expect(toIpa('ziah8').ipa).toBe('tsiaʔ⁴')
    expect(toIpa('lag8').ipa).toBe('lak̚⁴')
    expect(toIpa('zab8').ipa).toBe('tsap̚⁴')
  })

  it('marks nasalisation on the vowel', () => {
    expect(toIpa('san1').ipa).toBe('sã³³')
  })

  it('marks syllabic nasals, including after an initial', () => {
    // U+0329 COMBINING VERTICAL LINE BELOW — the IPA syllabicity diacritic.
    expect(toIpa('ng5').ipa).toBe('ŋ̩⁵⁵')
    expect(toIpa('bng7').ipa).toBe('pŋ̩¹¹')
  })

  it('reports the weakest confidence used, with its caveat', () => {
    // `io` → [ie] is a medium-confidence Chaozhou-specific claim.
    const r = toIpa('dio5')
    expect(r.confidence).toBe('medium')
    expect(r.caveats.join(' ')).toMatch(/Shantou/u)
  })

  it('keeps high confidence for fully-attested mappings', () => {
    expect(toIpa('nang5').confidence).toBe('high')
  })
})

describe('toIpa — variety differences', () => {
  it('gives Shantou [tio] where Chaozhou has [tie]', () => {
    expect(toIpa('dio5', 'chaozhou').ipa).toBe('tie⁵⁵')
    expect(toIpa('dio5', 'shantou').ipa).toBe('tio⁵⁵')
  })

  it('keeps /ɯ/ in Shantou, which differs only in the tone contour', () => {
    // Swatow is Northern Teochew and does NOT merge /ɯ/ into /u/ — that is the
    // Southern (Chaoyang–Puning–Huilai) merger. See REVIEW.md §1.
    expect(toIpa('le2', 'chaozhou').ipa).toBe('lɯ⁵³')
    expect(toIpa('le2', 'shantou').ipa).toBe('lɯ⁵²')
  })

  it('inherits unlisted mappings from the base variety', () => {
    // Shantou lists no initials at all; they come from Chaozhou.
    expect(toIpa('nang5', 'shantou').ipa).toBe('naŋ⁵⁵')
  })
})

describe('toPoj', () => {
  it('transliterates the reference word', () => {
    expect(toPoj('dio5 ziu1')).toBe('tiô-tsiu')
  })

  it('places the tone mark by the classical priority', () => {
    expect(toPoj('ziah8')).toBe('tsia̍h'.normalize('NFC'))
    expect(toPoj('nang5')).toBe('nâng')
  })

  it('marks the second vowel in the iu and ui rimes', () => {
    // The standard exception to the a-o-e-u-i priority.
    expect(toPoj('siu5')).toBe('siû')
    expect(toPoj('gui2')).toBe('kuí')
  })

  it('re-spells stop codas as p/t/k', () => {
    expect(toPoj('lag8')).toBe('la̍k'.normalize('NFC'))
    expect(toPoj('zab8')).toBe('tsa̍p'.normalize('NFC'))
  })

  it('writes nasalisation as a trailing superscript n', () => {
    expect(toPoj('san1')).toBe('saⁿ')
  })

  it('marks syllabic nasals after an initial', () => {
    // 卵 and 飯 are the minimal pair for the tone 6/7 distinction: 卵 is 陽上
    // (caron), 飯 is 陽去 (macron). Hokkien merged the two categories and writes
    // a macron for both (nn̄g, pn̄g), so a Hokkien form cannot be used to pick
    // between them here — the diacritic follows the tone number.
    expect(toPoj('nng6')).toBe('nňg'.normalize('NFC'))
    expect(toPoj('bng7')).toBe('pn̄g'.normalize('NFC'))
  })
})

describe('applySandhi', () => {
  it('leaves the final syllable in its citation tone', () => {
    const r = applySandhi('dio5 ziu1')
    expect(r.syllables.at(-1)).toMatchObject({ citationTone: 1, surfaceTone: 1, changed: false })
  })

  it('changes every non-final syllable', () => {
    const r = applySandhi('dio5 ziu1')
    expect(r.syllables[0]).toMatchObject({ citationTone: 5, surfaceTone: 7, contour: '11' })
    expect(r.surface).toBe('dio7 ziu1')
  })

  it('applies across a three-syllable group', () => {
    const r = applySandhi('ga1 gi6 nang5')
    expect(r.syllables.map((s) => s.changed)).toEqual([false, true, false])
    expect(r.syllables.map((s) => s.surfaceTone)).toEqual([1, 7, 5])
  })

  it('is a no-op on a single syllable', () => {
    const r = applySandhi('nang5')
    expect(r.surface).toBe('nang5')
    expect(r.syllables[0]?.changed).toBe(false)
  })

  it('flags that the table still needs specialist review', () => {
    expect(applySandhi('dio5 ziu1').needsReview).toBe(true)
  })
})
