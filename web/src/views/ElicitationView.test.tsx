import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ElicitationView } from './ElicitationView'
import type { SoundsData } from '../types/sounds'

const CONSENT_STORAGE_KEY = 'teochew-dictionary:elicitation-consent-acknowledged'

// jsdom's Blob has no arrayBuffer() (unlike every real browser) — FileReader
// is the one jsdom API that can actually read one back out.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error as Error)
      reader.readAsArrayBuffer(this)
    })
  }
}

class FakeMediaRecorder {
  static isTypeSupported = () => true
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm'
  }

  start() {}

  stop() {
    this.ondataavailable?.({ data: new Blob(['fake audio bytes'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function stubMedia() {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }))
}

/**
 * Only `TARGET` needs a second session (exactly one real, published clip);
 * every other fixture sound has either two real clips (already has one) so
 * it can still serve as an axis reference without itself entering the
 * queue. `TARGET`'s axis-mates are each engineered to match exactly one of
 * initial/rime/tone, so every reference group has exactly one candidate —
 * no `Math.random` mocking needed anywhere in this file.
 */
const TARGET = {
  pengim: 'da1',
  ipa: 'da³³',
  initial: 'd',
  rime: 'a',
  tone: 1,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'target.wav', speaker: 'jky' }],
}

const SAME_INITIAL = {
  pengim: 'do2',
  ipa: 'do⁵³',
  initial: 'd',
  rime: 'o',
  tone: 2,
  occurrences: 1,
  examples: [],
  clips: [
    { url: 'ref-initial-a.wav', speaker: 'jky' },
    { url: 'ref-initial-b.wav', speaker: 'jky-2' },
  ],
}

const SAME_RIME = {
  pengim: 'ba5',
  ipa: 'ba²¹³',
  initial: 'b',
  rime: 'a',
  tone: 5,
  occurrences: 1,
  examples: [],
  clips: [
    { url: 'ref-rime-a.wav', speaker: 'jky' },
    { url: 'ref-rime-b.wav', speaker: 'jky-2' },
  ],
}

const SAME_TONE = {
  pengim: 'bi1',
  ipa: 'bi³³',
  initial: 'b',
  rime: 'i',
  tone: 1,
  occurrences: 1,
  examples: [],
  clips: [
    { url: 'ref-tone-a.wav', speaker: 'jky' },
    { url: 'ref-tone-b.wav', speaker: 'jky-2' },
  ],
}

const ALREADY_DONE = {
  pengim: 'zo8',
  ipa: 'zo¹¹',
  initial: 'z',
  rime: 'o',
  tone: 8,
  occurrences: 1,
  examples: [],
  clips: [
    { url: 'done-a.wav', speaker: 'jky' },
    { url: 'done-b.wav', speaker: 'jky-2' },
  ],
}

const NO_RECORDING = {
  pengim: 'never1',
  ipa: 'ne³³',
  initial: 'n',
  rime: 'e',
  tone: 7,
  occurrences: 1,
  examples: [],
  clips: [],
}

const FULL_FIXTURE: SoundsData = {
  variety: 'chaozhou',
  sounds: [TARGET, SAME_INITIAL, SAME_RIME, SAME_TONE, ALREADY_DONE, NO_RECORDING],
}

function stubFetch(data: SoundsData, opts: { onSave?: (body: unknown) => void } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/local-recordings')) {
        if (init?.method === 'POST') {
          opts.onSave?.(JSON.parse(init.body as string))
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }
        return Promise.resolve(new Response(JSON.stringify({ published: {}, pending: [], staged: {} }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }),
  )
}

/** Simulates a live staging store: DELETE actually removes from the map returned by the next GET. */
function stubFetchWithStaged(data: SoundsData, initialStaged: Record<string, { localPath: string; recordedDate: string }[]>) {
  const staged = structuredClone(initialStaged)
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/local-recordings')) {
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      if (init?.method === 'DELETE') {
        const { localPath } = JSON.parse(init.body as string) as { localPath: string }
        for (const key of Object.keys(staged)) staged[key] = staged[key]!.filter((t) => t.localPath !== localPath)
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ published: {}, pending: [], staged }), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function recordAClip() {
  fireEvent.click(screen.getByRole('button', { name: '● Start recording' }))
  await screen.findByRole('button', { name: '■ Stop' })
  fireEvent.click(screen.getByRole('button', { name: '■ Stop' }))
  await screen.findByRole('button', { name: 'Save to staging' })
}

describe('ElicitationView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the one syllable that needs a second session, with a progress count', async () => {
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    expect(await screen.findByText('da1')).toBeInTheDocument()
    expect(screen.getByText('1 syllable still need a second session')).toBeInTheDocument()
    expect(screen.queryByText('zo8')).not.toBeInTheDocument()
    expect(screen.queryByText('never1')).not.toBeInTheDocument()
  })

  it('shows a "Same sound" reference to the target\'s own existing recording, plus one candidate per axis', async () => {
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByText('Same sound')).toBeInTheDocument()
    expect(screen.getByLabelText('Play your existing recording of da1')).toBeInTheDocument()
    expect(screen.getByText('do2')).toBeInTheDocument() // same initial
    expect(screen.getByText('ba5')).toBeInTheDocument() // same rime
    expect(screen.getByText('bi1')).toBeInTheDocument() // same tone
    expect(screen.queryByText('no reference available')).not.toBeInTheDocument()
  })

  it('omits an axis reference group with no candidate instead of erroring', async () => {
    const sparse: SoundsData = { variety: 'chaozhou', sounds: [TARGET, SAME_INITIAL] }
    stubFetch(sparse)
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByText('do2')).toBeInTheDocument()
    // No sound shares a rime or tone with the target here.
    expect(screen.getAllByText('no reference available')).toHaveLength(2)
  })

  it('shows nothing left to record when the queue is empty', async () => {
    const noneNeeded: SoundsData = { variety: 'chaozhou', sounds: [ALREADY_DONE, NO_RECORDING] }
    stubFetch(noneNeeded)
    render(<ElicitationView />)

    expect(await screen.findByText('Nothing left to record right now.')).toBeInTheDocument()
    expect(screen.getByText('0 syllables still need a second session')).toBeInTheDocument()
  })

  it('a syllable with a staged-but-unmerged take stays in the pool and shows its staged takes', async () => {
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [TARGET] },
      { da1: [{ localPath: 'data/staging/recordings/chaozhou/da1__unassigned__abc.webm', recordedDate: '2026-09-15' }] },
    )
    render(<ElicitationView />)

    expect(await screen.findByText('da1')).toBeInTheDocument()
    expect(screen.getByText('1 syllable still need a second session')).toBeInTheDocument()
    expect(screen.getByText('Staged take for da1')).toBeInTheDocument()
    expect(screen.getByText('2026-09-15')).toBeInTheDocument()
  })

  it('deletes a staged take', async () => {
    const fetchMock = stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [TARGET] },
      { da1: [{ localPath: 'data/staging/recordings/chaozhou/da1__unassigned__abc.webm', recordedDate: '2026-09-15' }] },
    )
    render(<ElicitationView />)

    await screen.findByText('Staged take for da1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Staged take for da1')).not.toBeInTheDocument())
    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')
    expect(JSON.parse((deleteCall?.[1] as RequestInit).body as string)).toEqual({
      localPath: 'data/staging/recordings/chaozhou/da1__unassigned__abc.webm',
    })
  })

  it('remembers consent across renders (only needs to be checked once)', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true')
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByLabelText(/AUDIO-CONSENT\.md/)).toBeChecked()
  })

  it('persists consent to localStorage when checked', async () => {
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByLabelText(/AUDIO-CONSENT\.md/)).not.toBeChecked()
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))

    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('true')
  })

  it('re-picks a different target without excluding the current one from the pool', async () => {
    const A = { pengim: 'ra1', ipa: 'ra³³', initial: 'r', rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [{ url: 'a.wav', speaker: 'jky' }] }
    const B = { pengim: 'sb2', ipa: 'sb⁵³', initial: 's', rime: 'e', tone: 2, occurrences: 1, examples: [], clips: [{ url: 'b.wav', speaker: 'jky' }] }
    stubFetch({ variety: 'chaozhou', sounds: [A, B] })
    render(<ElicitationView />)

    await screen.findByText('2 syllables still need a second session')
    const pengimEl = () => document.querySelector('.elicitation-view__target-pengim')?.textContent
    const first = pengimEl()
    expect(['ra1', 'sb2']).toContain(first)

    fireEvent.click(screen.getByRole('button', { name: 'Re-pick' }))

    expect(pengimEl()).not.toBe(first)
    expect(['ra1', 'sb2']).toContain(pengimEl())
    // Neither target was excluded from the pool by re-picking.
    expect(screen.getByText('2 syllables still need a second session')).toBeInTheDocument()
  })

  it('records and stages a take without a speaker field in the request body', async () => {
    stubMedia()
    let savedBody: Record<string, unknown> | undefined
    stubFetch(FULL_FIXTURE, { onSave: (b) => (savedBody = b as Record<string, unknown>) })
    render(<ElicitationView />)

    await screen.findByText('da1')
    await recordAClip()

    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))

    await screen.findByRole('button', { name: '● Start recording' })
    expect(savedBody).toMatchObject({ pengim: 'da1', consentAcknowledged: true, mimeType: 'audio/webm;codecs=opus' })
    expect(savedBody).not.toHaveProperty('speaker')
    expect(typeof savedBody?.audioBase64).toBe('string')
  })

  it('stays on the same target after saving, so a second take can be recorded for it without re-checking consent', async () => {
    stubMedia()
    const saves: Record<string, unknown>[] = []
    stubFetch(FULL_FIXTURE, { onSave: (b) => saves.push(b as Record<string, unknown>) })
    render(<ElicitationView />)

    await screen.findByText('da1')
    await recordAClip()
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))
    await screen.findByRole('button', { name: '● Start recording' })
    expect(screen.getByText('da1')).toBeInTheDocument()

    // Consent stays checked — no need to click it again for the second take.
    expect(screen.getByLabelText(/AUDIO-CONSENT\.md/)).toBeChecked()
    await recordAClip()
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))
    await screen.findByRole('button', { name: '● Start recording' })

    expect(saves).toHaveLength(2)
    expect(saves[0]).toMatchObject({ pengim: 'da1' })
    expect(saves[1]).toMatchObject({ pengim: 'da1' })
  })

  it('shows an inline error and stays on the preview when the save request fails', async () => {
    stubMedia()
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/api/local-recordings')) {
          if (init?.method === 'POST') {
            return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'consentAcknowledged must be true' }), { status: 400 }))
          }
          return Promise.resolve(new Response(JSON.stringify({ published: {}, pending: [], staged: {} }), { status: 200 }))
        }
        return Promise.resolve(new Response(JSON.stringify(FULL_FIXTURE), { status: 200 }))
      }),
    )
    render(<ElicitationView />)

    await screen.findByText('da1')
    await recordAClip()
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('consentAcknowledged must be true')
    expect(screen.getByText('da1')).toBeInTheDocument()
  })
})
