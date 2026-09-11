import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EntryRow } from './EntryRow'
import type { EnrichedEntry } from '@teochew/core'

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

  it('shows citation pengim by default', () => {
    render(<EntryRow entry={ENTRY} selected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
  })

  it('shows the first selected pronunciationDisplay field instead of pengim', () => {
    render(<EntryRow entry={ENTRY} selected={false} onSelect={vi.fn()} pronunciationDisplay={['ipa', 'pengim']} />)
    expect(screen.getByText('tie⁵⁵ tsiu³³')).toBeInTheDocument()
    expect(screen.queryByText('dio5 ziu1')).not.toBeInTheDocument()
  })

  it('skips sandhi as the primary field when it matches the citation form', () => {
    // ENTRY's reading has sandhi === pengim, so a ['sandhi', 'poj'] order
    // should fall through to poj rather than showing nothing.
    render(<EntryRow entry={ENTRY} selected={false} onSelect={vi.fn()} pronunciationDisplay={['sandhi', 'poj']} />)
    expect(screen.getByText('tiô-tsiu')).toBeInTheDocument()
  })
})
