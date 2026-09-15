import type { AxisReferenceClip, Syllable } from '@teochew/core'
import { describe, expect, it } from 'vitest'

import { targetAxisFilters } from '../src/audio/target-filters.js'
import { loadPengimScheme } from '../src/phonology/load.js'

const scheme = loadPengimScheme()

function syllable(overrides: Partial<Syllable>): Syllable {
  return { raw: '', initial: null, medial: null, nucleus: 'a', nasalised: false, coda: null, tone: 1, syllabic: false, ...overrides }
}

function ref(overrides: Partial<AxisReferenceClip>): AxisReferenceClip {
  return {
    initial: '',
    rime: 'a',
    tone: 1,
    nasalised: false,
    coda: null,
    mfcc: [],
    onsetMs: null,
    f0Contour: null,
    ...overrides,
  }
}

describe('targetAxisFilters', () => {
  it('accepts only same-checkedness tones — checked target excludes unchecked references', () => {
    const filters = targetAxisFilters(syllable({ tone: 4 }), scheme) // tone 4 is checked (入聲)
    expect(filters.tone!(ref({ tone: 8 }))).toBe(true) // also checked
    expect(filters.tone!(ref({ tone: 1 }))).toBe(false) // unchecked
  })

  it('accepts only same-checkedness tones — unchecked target excludes checked references', () => {
    const filters = targetAxisFilters(syllable({ tone: 1 }), scheme)
    expect(filters.tone!(ref({ tone: 5 }))).toBe(true)
    expect(filters.tone!(ref({ tone: 4 }))).toBe(false)
  })

  it('accepts only references matching both nasalisation and coda', () => {
    const filters = targetAxisFilters(syllable({ nasalised: true, coda: null }), scheme)
    expect(filters.rime!(ref({ nasalised: true, coda: null }))).toBe(true)
    expect(filters.rime!(ref({ nasalised: false, coda: null }))).toBe(false) // not nasalised
    expect(filters.rime!(ref({ nasalised: true, coda: 'ng' }))).toBe(false) // has a coda too
  })

  it('leaves the initial axis unfiltered', () => {
    const filters = targetAxisFilters(syllable({}), scheme)
    expect(filters.initial).toBeUndefined()
  })
})
