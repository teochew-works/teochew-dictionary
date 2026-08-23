import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntryTree } from './EntryTree'
import type { EntryGroup } from '../search/sortEntries'
import type { EnrichedEntry } from '../types/dict'

function makeEntry(id: string, headword: string): EnrichedEntry {
  return {
    id,
    headword,
    readings: [
      {
        pengim: 'a1',
        variety: 'chaozhou',
        ipa: 'a',
        poj: 'a',
        sandhi: 'a1',
        ipa_confidence: 'medium',
        ipa_caveats: [],
        pengim_toneless: 'a',
        syllable_count: 1,
        audio: [null],
        wordAudio: null,
      },
    ],
    senses: [{ pos: 'noun', gloss_en: ['gloss'] }],
    sources: ['seed'],
    search_keys: [headword],
    licence: 'CC-BY-4.0',
    attributions: [],
  }
}

const GROUPS: EntryGroup[] = [
  { key: '1', label: 'Tone 1', entries: [makeEntry('a', '甲')] },
  { key: '2', label: 'Tone 2', entries: [makeEntry('b', '乙')] },
]

describe('EntryTree', () => {
  it('renders every group header with its entry count, expanded by default', () => {
    render(<EntryTree groups={GROUPS} selectedId={null} onSelect={() => {}} isSearching={false} />)
    expect(screen.getByRole('button', { name: /Tone 1/ })).toHaveTextContent('(1)')
    expect(screen.getByText('甲')).toBeInTheDocument()
  })

  it('hides a group\'s entries once its header is clicked', () => {
    render(<EntryTree groups={GROUPS} selectedId={null} onSelect={() => {}} isSearching={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Tone 1/ }))
    expect(screen.queryByText('甲')).not.toBeInTheDocument()
    expect(screen.getByText('乙')).toBeInTheDocument()
  })

  it('keeps a manually collapsed group open while isSearching is true', () => {
    render(<EntryTree groups={GROUPS} selectedId={null} onSelect={() => {}} isSearching={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Tone 1/ }))
    expect(screen.getByText('甲')).toBeInTheDocument()
  })

  it('shows "No matches." when there are no groups', () => {
    render(<EntryTree groups={[]} selectedId={null} onSelect={() => {}} isSearching={false} />)
    expect(screen.getByText('No matches.')).toBeInTheDocument()
  })
})
