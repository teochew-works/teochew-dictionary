import { describe, expect, it } from 'vitest'

import {
  PengimError,
  formatSyllable,
  parsePengim,
  parseSyllable,
  tryParsePengim,
} from '../src/phonology/syllable.js'

describe('parseSyllable', () => {
  it('splits initial, medial, nucleus and tone', () => {
    expect(parseSyllable('dio5')).toMatchObject({
      initial: 'd',
      medial: 'i',
      nucleus: 'o',
      coda: null,
      nasalised: false,
      tone: 5,
      syllabic: false,
    })
  })

  it('matches digraph initials longest-first', () => {
    // The whole point: `bho5` is bh+o, not b+ho.
    expect(parseSyllable('bho5')).toMatchObject({ initial: 'bh', nucleus: 'o' })
    expect(parseSyllable('gho5')).toMatchObject({ initial: 'gh', nucleus: 'o' })
    expect(parseSyllable('ngo2')).toMatchObject({ initial: 'ng', nucleus: 'o' })
    // ...but a single `n` before a vowel is still just `n`.
    expect(parseSyllable('no6')).toMatchObject({ initial: 'n', nucleus: 'o' })
  })

  it('treats a final n as nasalisation but ng as a velar coda', () => {
    // Teochew lost the /n/ coda, so this distinction carries real weight.
    expect(parseSyllable('in5')).toMatchObject({ nucleus: 'i', nasalised: true, coda: null })
    expect(parseSyllable('ing1')).toMatchObject({ nucleus: 'i', nasalised: false, coda: 'ng' })
    expect(parseSyllable('san1')).toMatchObject({ initial: 's', nucleus: 'a', nasalised: true })
    expect(parseSyllable('sang1')).toMatchObject({ initial: 's', nucleus: 'a', coda: 'ng' })
  })

  it('handles nasalisation before a stop coda', () => {
    expect(parseSyllable('toin2')).toMatchObject({
      initial: 't',
      nucleus: 'oi',
      nasalised: true,
      coda: null,
    })
  })

  it('reads a bare vowel as the nucleus, not a medial', () => {
    expect(parseSyllable('i1')).toMatchObject({ initial: null, medial: null, nucleus: 'i' })
    expect(parseSyllable('u6')).toMatchObject({ initial: null, medial: null, nucleus: 'u' })
    expect(parseSyllable('ua2')).toMatchObject({ medial: 'u', nucleus: 'a' })
  })

  it('prefers digraph nuclei over their prefixes', () => {
    expect(parseSyllable('gao2')).toMatchObject({ initial: 'g', nucleus: 'ao' })
    expect(parseSyllable('ngou6')).toMatchObject({ initial: 'ng', nucleus: 'ou' })
    expect(parseSyllable('lai5')).toMatchObject({ initial: 'l', nucleus: 'ai' })
  })

  it('parses syllabic nasals, bare and after an initial', () => {
    expect(parseSyllable('ng5')).toMatchObject({ initial: null, nucleus: 'ng', syllabic: true })
    expect(parseSyllable('m6')).toMatchObject({ initial: null, nucleus: 'm', syllabic: true })
    // 飯 — a syllabic nasal carrying an initial.
    expect(parseSyllable('bng6')).toMatchObject({ initial: 'b', nucleus: 'ng', syllabic: true })
  })

  it('is case- and unicode-normalisation-insensitive', () => {
    expect(parseSyllable('DIO5').raw).toBe('dio5')
    // ê as e + combining circumflex must parse the same as precomposed ê.
    expect(parseSyllable('dê5')).toMatchObject({ initial: 'd', nucleus: 'ê' })
  })
})

describe('phonotactic constraints', () => {
  it('requires a stop coda for the checked tones 4 and 8', () => {
    expect(() => parseSyllable('za8')).toThrow(PengimError)
    expect(() => parseSyllable('go4')).toThrow(/checked/u)
  })

  it('rejects a stop coda under a non-checked tone', () => {
    expect(() => parseSyllable('ziah5')).toThrow(/checked tone/u)
    expect(() => parseSyllable('lag5')).toThrow(/checked tone/u)
  })

  it('accepts the well-formed checked syllables', () => {
    expect(parseSyllable('ziah8')).toMatchObject({ coda: 'h', tone: 8 })
    // Peng'im stop codas are -b/-g/-d, not -p/-t/-k.
    expect(parseSyllable('lag8')).toMatchObject({ nucleus: 'a', coda: 'g', tone: 8 })
    expect(parseSyllable('zab8')).toMatchObject({ nucleus: 'a', coda: 'b', tone: 8 })
    expect(parseSyllable('zêg8')).toMatchObject({ nucleus: 'ê', coda: 'g', tone: 8 })
  })

  it('still reads -ng as a nasal coda rather than -g', () => {
    expect(parseSyllable('lang5')).toMatchObject({ nucleus: 'a', coda: 'ng', tone: 5 })
    expect(parseSyllable('lag8')).toMatchObject({ coda: 'g' })
  })
})

describe('malformed input', () => {
  it.each([
    ['', 'empty'],
    ['dio', 'missing tone'],
    ['5', 'no syllable'],
    ['dio9', 'missing tone'],
    ['xyz1', 'vowel'],
    ['d1', 'vowel'],
  ])('rejects %j', (input) => {
    expect(() => parseSyllable(input)).toThrow(PengimError)
  })

  it('reports the offending syllable without aborting a batch', () => {
    const result = tryParsePengim('dio5 zzz1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('zzz1')
  })
})

describe('round-trip', () => {
  const samples = [
    'dio5', 'ziu1', 'ziah8', 'nang5', 'bng6', 'ng5', 'm6', 'san1', 'toin2',
    'ngou6', 'gao2', 'lag8', 'ua2', 'le2', 'i1', 'ing1', 'in5', 'bho5', 'cu3',
  ]
  it.each(samples)('%s survives parse → format', (s) => {
    expect(formatSyllable(parseSyllable(s))).toBe(s)
  })
})

describe('parsePengim', () => {
  it('splits multi-syllable words on whitespace', () => {
    expect(parsePengim('dio5 ziu1')).toHaveLength(2)
    expect(parsePengim('  dio5   ziu1  ')).toHaveLength(2)
  })
})
