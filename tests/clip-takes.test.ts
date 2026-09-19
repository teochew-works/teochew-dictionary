import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'

import type { AudioClip } from '@teochew/core'
import { applyTakePlanToDoc, applyTakePlanToList, describeTake, planTakeMerge, takeFields } from '../src/importers/clip-takes.js'

const CDN = 'https://daidb11aas52z.cloudfront.net/teochew/clips'

function clip(overrides: Partial<AudioClip> & { checksum: string }): AudioClip {
  return {
    url: `${CDN}/jky/ku3.webm`,
    confidence: 'high',
    sources: ['teochew-dictionary-audio'],
    speaker: 'jky',
    ...overrides,
  }
}

const A = clip({ checksum: `sha256:${'a'.repeat(64)}` })
const B = clip({ checksum: `sha256:${'b'.repeat(64)}`, take: 2, url: `${CDN}/jky/ku3-take2.webm` })

describe('planTakeMerge', () => {
  it('reports bytes already at the key as already merged, whoever published them', () => {
    const theirs = clip({ checksum: A.checksum, speaker: 'someone-else' })
    expect(planTakeMerge([theirs], { speaker: 'jky', checksum: A.checksum })).toMatchObject({
      disposition: 'already-merged',
      existingIndex: 0,
      take: 1,
      primary: true,
    })
  })

  it('reports an already-merged lone clip as primary even with no explicit marker', () => {
    expect(planTakeMerge([A], { speaker: 'jky', checksum: A.checksum }).primary).toBe(true)
  })

  it('appends a speaker\'s first clip with no take and no primary', () => {
    const plan = planTakeMerge([clip({ checksum: A.checksum, speaker: 'other' })], { speaker: 'jky', checksum: 'sha256:new' })
    expect(plan).toMatchObject({ disposition: 'appended-first', take: 1, primary: false })
    expect(plan.setPrimaryAt).toBeUndefined()
    expect(takeFields(plan)).toEqual({})
  })

  it('makes the previously-lone clip explicitly primary when the group grows past one', () => {
    const plan = planTakeMerge([A], { speaker: 'jky', checksum: 'sha256:new' })
    expect(plan).toMatchObject({ disposition: 'appended-take', take: 2, primary: false, setPrimaryAt: 0 })
    expect(takeFields(plan)).toEqual({ take: 2 })
  })

  it('leaves an existing explicit primary alone', () => {
    const plan = planTakeMerge([{ ...A, primary: true as const }, B], { speaker: 'jky', checksum: 'sha256:new' })
    expect(plan).toMatchObject({ take: 3, clearPrimaryAt: [] })
    expect(plan.setPrimaryAt).toBeUndefined()
  })

  it('moves the marker to the new take when primary is requested', () => {
    const plan = planTakeMerge([{ ...A, primary: true as const }, B], { speaker: 'jky', checksum: 'sha256:new', primary: true })
    expect(plan).toMatchObject({ take: 3, primary: true, clearPrimaryAt: [0] })
    expect(takeFields(plan)).toEqual({ take: 3, primary: true })
  })

  it('numbers from the highest existing take, never over a gap', () => {
    const gapped = [{ ...A, primary: true as const }, { ...B, take: 5 }]
    expect(planTakeMerge(gapped, { speaker: 'jky', checksum: 'sha256:new' }).take).toBe(6)
  })

  it('excludes a synthesis render from the speaker\'s group', () => {
    const render = clip({
      checksum: `sha256:${'c'.repeat(64)}`,
      synthesis: 'world-retune',
      derivedFrom: A.checksum,
      confidence: 'medium',
    })
    // Filed under the recording speaker by hand — it still must not count as
    // one of their takes, or the next merge would skip a number.
    expect(planTakeMerge([A, render], { speaker: 'jky', checksum: 'sha256:new' }).take).toBe(2)
  })
})

describe('applyTakePlanToList', () => {
  it('deletes a cleared primary marker rather than writing primary: false', () => {
    const plan = planTakeMerge([{ ...A, primary: true as const }, B], { speaker: 'jky', checksum: 'sha256:new', primary: true })
    const list = applyTakePlanToList([{ ...A, primary: true as const }, B], clip({ checksum: 'sha256:new', take: 3, primary: true }), plan)
    expect('primary' in list[0]!).toBe(false)
    expect(list[2]?.primary).toBe(true)
  })

  it('changes nothing for an already-merged plan', () => {
    const plan = planTakeMerge([A], { speaker: 'jky', checksum: A.checksum })
    expect(applyTakePlanToList([A], A, plan)).toEqual([A])
  })
})

describe('applyTakePlanToDoc', () => {
  it('creates a one-element sequence for a key the manifest does not have yet', () => {
    // `addIn` on a missing key would build a *map* from the clip instead.
    const doc = parseDocument('clips:\n  ang1:\n    - { url: x }\n')
    const plan = planTakeMerge([], { speaker: 'jky', checksum: 'sha256:new' })
    applyTakePlanToDoc(doc, 'clips', 'ku3', clip({ checksum: 'sha256:new' }), plan)
    expect(Array.isArray(doc.toJSON().clips.ku3)).toBe(true)
    expect(doc.toJSON().clips.ku3).toHaveLength(1)
  })
})

describe('describeTake', () => {
  it('says what happened, one line per disposition', () => {
    expect(describeTake({ disposition: 'already-merged', take: 2, primary: false })).toMatch(/already published/u)
    expect(describeTake({ disposition: 'appended-first', take: 1, primary: true })).toMatch(/first clip/u)
    expect(describeTake({ disposition: 'appended-take', take: 3, primary: false })).toMatch(/training-only/u)
    expect(describeTake({ disposition: 'appended-take', take: 3, primary: true })).toMatch(/published take/u)
  })
})
