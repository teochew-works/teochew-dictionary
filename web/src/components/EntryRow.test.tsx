import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EntryRow } from './EntryRow'
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
      sandhiAudio: [null, null],
      wordAudio: null,
    },
  ],
  senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
  sources: ['seed'],
  search_keys: ['潮州', 'dio5 ziu1'],
  licence: 'CC-BY-4.0',
  attributions: [],
}

describe('EntryRow', () => {
  afterEach(cleanup)

  it('shows a level badge when the entry has a level', () => {
    render(<EntryRow entry={{ ...ENTRY, level: 'A2' }} selected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('A2')).toBeInTheDocument()
  })

  it('omits the level badge when the entry has no level', () => {
    render(<EntryRow entry={ENTRY} selected={false} onSelect={vi.fn()} />)
    expect(screen.queryByText(/^[ABC][12]$/)).not.toBeInTheDocument()
  })
})
