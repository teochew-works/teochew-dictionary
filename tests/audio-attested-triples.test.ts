import { describe, expect, it } from 'vitest'

import { attestedTriples } from '../src/audio/attested-triples.js'
import type { Sound } from '../src/build/sounds.js'

function sound(overrides: Partial<Sound> & Pick<Sound, 'pengim' | 'initial' | 'rime' | 'tone'>): Sound {
  return { ipa: '', occurrences: 1, examples: [], clips: [], ...overrides }
}

describe('attestedTriples', () => {
  it('factors each sound into its (syllable, initial, rime, tone) triple', () => {
    const sounds = [
      sound({ pengim: 'deng1', initial: 'd', rime: 'eng', tone: 1 }),
      sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1 }),
    ]
    expect(attestedTriples(sounds)).toEqual([
      { syllable: 'deng1', initial: 'd', rime: 'eng', tone: 1 },
      { syllable: 'a1', initial: '', rime: 'a', tone: 1 },
    ])
  })

  it('normalises the zero initial to an empty string, not null', () => {
    const [triple] = attestedTriples([sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1 })])
    expect(triple!.initial).toBe('')
  })
})
