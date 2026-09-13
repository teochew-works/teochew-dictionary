import { describe, expect, it } from 'vitest'
import { classifyAxes, type AxisReferenceClip } from './classify.js'
import type { AttestedTriple } from './combine.js'

function frame(v: number): number[] {
  return [v, v]
}

// 'd eng 1' has an onset (obstruent), 'ng eng 1' is sonorant (voiced from
// frame 0) and 'd a 3' is a different rime and tone entirely.
const REFERENCES: Record<string, AxisReferenceClip> = {
  deng1: {
    initial: 'd',
    rime: 'eng',
    tone: 1,
    mfcc: [frame(9), frame(9), frame(1), frame(1), frame(1)], // onset then rime
    onsetMs: 20, // 2 frames at 10ms hop
    f0Contour: [100, 105, 110, 115, 120],
  },
  ngeng1: {
    initial: 'ng',
    rime: 'eng',
    tone: 1,
    mfcc: [frame(2), frame(1), frame(1), frame(1), frame(1)], // sonorant, no real onset
    onsetMs: null,
    f0Contour: [101, 106, 111, 116, 121],
  },
  da3: {
    initial: 'd',
    rime: 'a',
    tone: 3,
    mfcc: [frame(9), frame(9), frame(5), frame(5), frame(5)],
    onsetMs: 20,
    f0Contour: [180, 160, 140, 120, 100],
  },
}

const ATTESTED: AttestedTriple[] = [
  { syllable: 'deng1', initial: 'd', rime: 'eng', tone: 1 },
  { syllable: 'ngeng1', initial: 'ng', rime: 'eng', tone: 1 },
  { syllable: 'da3', initial: 'd', rime: 'a', tone: 3 },
  // Legal per-axis ('d' initial, 'eng' rime, tone 3 all exist elsewhere)
  // but never attested together — must never win.
]

const PARAMS = { hopMs: 10, minOnsetMs: 15, fallbackWindowMs: 20 }

describe('classifyAxes', () => {
  it("ranks a near-exact copy of a reference clip as that reference's syllable", () => {
    const query = { mfcc: REFERENCES.deng1!.mfcc, onsetMs: REFERENCES.deng1!.onsetMs, f0Contour: REFERENCES.deng1!.f0Contour }
    const ranked = classifyAxes(query, Object.values(REFERENCES), ATTESTED, PARAMS)
    expect(ranked[0]!.syllable).toBe('deng1')
  })

  it('never returns an unattested combination even when its axes score well individually', () => {
    // A query whose rime/onset resemble deng1 but whose tone contour resembles da3 —
    // "d eng 3" is legal per-axis but not in ATTESTED, so it must not appear.
    const query = { mfcc: REFERENCES.deng1!.mfcc, onsetMs: REFERENCES.deng1!.onsetMs, f0Contour: REFERENCES.da3!.f0Contour }
    const ranked = classifyAxes(query, Object.values(REFERENCES), ATTESTED, PARAMS)
    expect(ranked.map((c) => c.syllable)).not.toContain('deng3')
    expect(ranked.every((c) => ATTESTED.some((t) => t.syllable === c.syllable))).toBe(true)
  })

  it('falls back to the fixed window for a sonorant-initial reference (null onsetMs)', () => {
    const query = { mfcc: REFERENCES.ngeng1!.mfcc, onsetMs: null, f0Contour: REFERENCES.ngeng1!.f0Contour }
    const ranked = classifyAxes(query, Object.values(REFERENCES), ATTESTED, PARAMS)
    expect(ranked[0]!.syllable).toBe('ngeng1')
  })

  it('omits the tone axis for a candidate when either contour is missing, without crashing', () => {
    const query = { mfcc: REFERENCES.deng1!.mfcc, onsetMs: REFERENCES.deng1!.onsetMs, f0Contour: null }
    expect(() => classifyAxes(query, Object.values(REFERENCES), ATTESTED, PARAMS)).not.toThrow()
  })
})
