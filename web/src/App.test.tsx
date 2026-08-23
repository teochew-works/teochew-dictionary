import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'
import type { Dict } from './types/dict'

const FIXTURE: Dict = {
  meta: { generated_from: 'data/', entry_count: 1, reading_count: 1, varieties: [], sources: [] },
  entries: [
    {
      id: 'dio5-ziu1-潮州',
      headword: '潮州',
      readings: [
        {
          pengim: 'dio5 ziu1',
          variety: 'chaozhou',
          ipa: 'tie⁵⁵ tsiu³³',
          poj: 'tiô-tsiu',
          sandhi: 'dio7 ziu1',
          ipa_confidence: 'medium',
          ipa_caveats: [],
          pengim_toneless: 'dio ziu',
          syllable_count: 2,
          audio: [null, null],
          wordAudio: null,
        },
      ],
      senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
      sources: ['seed'],
      search_keys: ['潮州', 'dio5 ziu1', 'Chaozhou'],
      licence: 'CC-BY-4.0',
      attributions: [],
    },
  ],
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the dictionary and shows the entry in the Dictionary tab', async () => {
    render(<App />)
    expect(await screen.findByText('潮州')).toBeInTheDocument()
  })
})

describe('App with a hidden entry', () => {
  const FIXTURE_WITH_HIDDEN: Dict = {
    ...FIXTURE,
    entries: [...FIXTURE.entries, { ...FIXTURE.entries[0]!, id: 'hidden-entry', headword: '隱藏詞', hidden: true }],
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE_WITH_HIDDEN), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not show entries flagged hidden', async () => {
    render(<App />)
    expect(await screen.findByText('潮州')).toBeInTheDocument()
    expect(screen.queryByText('隱藏詞')).not.toBeInTheDocument()
  })
})
