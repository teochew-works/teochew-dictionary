import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EntryDetail } from './EntryDetail'
import type { EnrichedEntry } from '../types/dict'

const ENTRY: EnrichedEntry = {
  id: 'dio5-ziu1-潮州',
  headword: '潮州',
  readings: [
    {
      pengim: 'dio5 ziu1',
      variety: 'chaozhou',
      ipa: 'tie⁵⁵ tsiu³³',
      poj: 'tiô-tsiu',
      sandhi: 'dio5 ziu1',
      ipa_confidence: 'medium',
      ipa_caveats: [],
      pengim_toneless: 'dio ziu',
      syllable_count: 2,
      audio: [null, null],
      wordAudio: null,
    },
  ],
  senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
  sources: ['seed', 'wiktionary'],
  search_keys: ['潮州', 'dio5 ziu1', 'Chaozhou'],
  licence: 'CC-BY-SA-4.0',
  attributions: ['Wiktionary (CC-BY-SA-4.0)'],
}

describe('EntryDetail', () => {
  afterEach(cleanup)

  it('hides licence and attributions when showLicence is false', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} />)
    expect(screen.queryByText(/Licence:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Wiktionary (CC-BY-SA-4.0)')).not.toBeInTheDocument()
  })

  it('shows licence (linked) and attributions when showLicence is true', () => {
    render(<EntryDetail entry={ENTRY} showLicence={true} />)
    const link = screen.getByRole('link', { name: 'CC-BY-SA-4.0' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-SA-4.0',
    )
    expect(screen.getByText('Wiktionary (CC-BY-SA-4.0)')).toBeInTheDocument()
  })

  it('omits the attributions list when there are none', () => {
    render(<EntryDetail entry={{ ...ENTRY, attributions: [] }} showLicence={true} />)
    expect(screen.getByRole('link', { name: 'CC-BY-SA-4.0' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
