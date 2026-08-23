import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  appendLocalRecordingProposal,
  findLocalRecordingProposals,
  readLocalRecordingStaging,
  removeLocalRecordingProposal,
} from '../src/importers/local-recording-staging.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'

function proposal(overrides: Partial<LocalRecordingProposal> = {}): LocalRecordingProposal {
  return {
    pengim: 'dio5',
    syllableCount: 1,
    localPath: 'data/staging/recordings/chaozhou/dio5__speaker-1__20260823.wav',
    speaker: 'speaker-1',
    recordedDate: '2026-08-23',
    consentAcknowledged: true,
    variety: 'chaozhou',
    ...overrides,
  }
}

describe('local-recording-staging', () => {
  let stagingDir: string

  beforeEach(() => {
    stagingDir = mkdtempSync(join(tmpdir(), 'local-recording-staging-test-'))
  })

  afterEach(() => {
    rmSync(stagingDir, { recursive: true, force: true })
  })

  it('creates the staging file with the proposal on first append', () => {
    const path = appendLocalRecordingProposal(proposal(), stagingDir)
    expect(path).toBe(join(stagingDir, 'teochew-dictionary-audio.yaml'))

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.source).toBe('teochew-dictionary-audio')
    expect(written.proposals).toHaveLength(1)
    expect(written.proposals[0]).toMatchObject({ pengim: 'dio5', speaker: 'speaker-1' })
  })

  it('appends to an existing file rather than overwriting it', () => {
    appendLocalRecordingProposal(proposal({ pengim: 'dio5' }), stagingDir)
    const path = appendLocalRecordingProposal(proposal({ pengim: 'ang1' }), stagingDir)

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.proposals.map((p: LocalRecordingProposal) => p.pengim)).toEqual(['dio5', 'ang1'])
  })

  it('preserves a hand-written comment when appending to an existing file', () => {
    const path = appendLocalRecordingProposal(proposal(), stagingDir)
    const handComment = '# hand note: dio5 sounds slightly clipped, consider re-recording'
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n${handComment}\n`)

    appendLocalRecordingProposal(proposal({ pengim: 'ang1' }), stagingDir)
    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })

  it('returns null when nothing has been staged yet', () => {
    expect(readLocalRecordingStaging(stagingDir)).toBeNull()
  })

  it('reads back what append wrote', () => {
    appendLocalRecordingProposal(proposal(), stagingDir)

    const staged = readLocalRecordingStaging(stagingDir)
    expect(staged?.proposals).toHaveLength(1)
    expect(staged?.proposals[0]?.pengim).toBe('dio5')
  })

  it('removes only the proposal at the given index', () => {
    appendLocalRecordingProposal(proposal({ pengim: 'dio5' }), stagingDir)
    appendLocalRecordingProposal(proposal({ pengim: 'ang1' }), stagingDir)
    appendLocalRecordingProposal(proposal({ pengim: 'bhue2' }), stagingDir)

    removeLocalRecordingProposal(1, stagingDir)

    const staged = readLocalRecordingStaging(stagingDir)
    expect(staged?.proposals.map((p) => p.pengim)).toEqual(['dio5', 'bhue2'])
  })

  it('is a no-op when nothing has been staged yet', () => {
    expect(() => removeLocalRecordingProposal(0, stagingDir)).not.toThrow()
    expect(existsSync(join(stagingDir, 'teochew-dictionary-audio.yaml'))).toBe(false)
  })

  describe('findLocalRecordingProposals', () => {
    it('returns an empty array when nothing has been staged yet', () => {
      expect(findLocalRecordingProposals('dio5', 'chaozhou', stagingDir)).toEqual([])
    })

    it('returns an empty array when nothing matches the pengim+variety pair', () => {
      appendLocalRecordingProposal(proposal({ pengim: 'ang1' }), stagingDir)
      expect(findLocalRecordingProposals('dio5', 'chaozhou', stagingDir)).toEqual([])
    })

    it('finds a proposal matching both pengim and variety', () => {
      appendLocalRecordingProposal(proposal({ pengim: 'ang1' }), stagingDir)
      appendLocalRecordingProposal(proposal({ pengim: 'dio5', variety: 'chaozhou' }), stagingDir)

      const found = findLocalRecordingProposals('dio5', 'chaozhou', stagingDir)
      expect(found).toEqual([{ index: 1, proposal: proposal({ pengim: 'dio5', variety: 'chaozhou' }) }])
    })

    it('does not match a proposal with the same pengim but a different variety', () => {
      appendLocalRecordingProposal(proposal({ pengim: 'dio5', variety: 'chaoyang' }), stagingDir)
      expect(findLocalRecordingProposals('dio5', 'chaozhou', stagingDir)).toEqual([])
    })

    it('returns multiple matches sorted by descending index', () => {
      appendLocalRecordingProposal(proposal({ pengim: 'dio5', variety: 'chaozhou' }), stagingDir) // index 0
      appendLocalRecordingProposal(proposal({ pengim: 'ang1', variety: 'chaozhou' }), stagingDir) // index 1
      appendLocalRecordingProposal(proposal({ pengim: 'dio5', variety: 'chaozhou' }), stagingDir) // index 2

      const found = findLocalRecordingProposals('dio5', 'chaozhou', stagingDir)
      expect(found.map((f) => f.index)).toEqual([2, 0])
    })
  })
})
