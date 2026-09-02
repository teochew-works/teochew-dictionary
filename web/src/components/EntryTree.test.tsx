import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntryTree } from './EntryTree'
import type { EntryGroup } from '@teochew/core'
import type { EnrichedEntry } from '@teochew/core'
import { makeEntry as makeBaseEntry, makeReading } from '../test/entryFixtures'

function makeEntry(id: string, headword: string): EnrichedEntry {
  return makeBaseEntry({
    id,
    headword,
    readings: [makeReading({ pengim: 'a1', ipa: 'a', poj: 'a', sandhi: 'a1', pengim_toneless: 'a', syllable_count: 1, audio: [null] })],
    senses: [{ pos: 'noun', gloss_en: ['gloss'] }],
    search_keys: [headword],
  })
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
