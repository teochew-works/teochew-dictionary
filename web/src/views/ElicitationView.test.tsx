import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ElicitationView } from './ElicitationView'
import type { SoundsData } from '../types/sounds'

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
 * Only `target` needs a second session (exactly one real clip); every other
 * fixture sound has either two real clips (already has one) so it can still
 * serve as an axis reference without itself entering the queue. `target`'s
 * axis-mates are each engineered to match exactly one of initial/rime/tone,
 * so every reference group has exactly one candidate — no `Math.random`
 * mocking needed anywhere in this file.
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

const PENDING = {
  pengim: 'pending1',
  ipa: 'pe¹¹',
  initial: 'p',
  rime: 'e',
  tone: 6,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'pending.wav', speaker: 'jky' }],
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
  sounds: [TARGET, SAME_INITIAL, SAME_RIME, SAME_TONE, ALREADY_DONE, PENDING, NO_RECORDING],
}

function stubFetch(data: SoundsData, opts: { pending?: string[]; onSave?: (body: unknown) => void } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/local-recordings')) {
        if (init?.method === 'POST') {
          opts.onSave?.(JSON.parse(init.body as string))
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ published: {}, pending: opts.pending ?? [] }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }),
  )
}

async function recordAClip() {
  fireEvent.click(screen.getByRole('button', { name: '● Start recording' }))
  await screen.findByRole('button', { name: '■ Stop' })
  fireEvent.click(screen.getByRole('button', { name: '■ Stop' }))
  await screen.findByRole('button', { name: 'Save to staging' })
}

describe('ElicitationView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the one syllable that needs a second session, with a progress count', async () => {
    stubFetch(FULL_FIXTURE, { pending: [PENDING.pengim] })
    render(<ElicitationView />)

    expect(await screen.findByText('da1')).toBeInTheDocument()
    expect(screen.getByText('1 syllable still need a second session')).toBeInTheDocument()
    // Neither the already-published, pending, nor never-recorded syllables show as the target.
    expect(screen.queryByText('zo8')).not.toBeInTheDocument()
    expect(screen.queryByText('pending1')).not.toBeInTheDocument()
    expect(screen.queryByText('never1')).not.toBeInTheDocument()
  })

  it('shows exactly one reference candidate per axis', async () => {
    stubFetch(FULL_FIXTURE, { pending: [PENDING.pengim] })
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByText('do2')).toBeInTheDocument() // same initial
    expect(screen.getByText('ba5')).toBeInTheDocument() // same rime
    expect(screen.getByText('bi1')).toBeInTheDocument() // same tone
    expect(screen.queryByText('no reference available')).not.toBeInTheDocument()
  })

  it('omits a reference group with no candidate instead of erroring', async () => {
    const sparse: SoundsData = { variety: 'chaozhou', sounds: [TARGET, SAME_INITIAL] }
    stubFetch(sparse)
    render(<ElicitationView />)

    await screen.findByText('da1')
    expect(screen.getByText('do2')).toBeInTheDocument()
    // No sound shares a rime or tone with the target here.
    expect(screen.getAllByText('no reference available')).toHaveLength(2)
  })

  it('shows nothing left to record when the queue is empty', async () => {
    const noneNeeded: SoundsData = { variety: 'chaozhou', sounds: [ALREADY_DONE, PENDING, NO_RECORDING] }
    stubFetch(noneNeeded, { pending: [PENDING.pengim] })
    render(<ElicitationView />)

    expect(await screen.findByText('Nothing left to record right now.')).toBeInTheDocument()
    expect(screen.getByText('0 syllables still need a second session')).toBeInTheDocument()
  })

  it('records and stages a take without a speaker field in the request body', async () => {
    stubMedia()
    let savedBody: Record<string, unknown> | undefined
    stubFetch(FULL_FIXTURE, { pending: [PENDING.pengim], onSave: (b) => (savedBody = b as Record<string, unknown>) })
    render(<ElicitationView />)

    await screen.findByText('da1')
    await recordAClip()

    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))

    await screen.findByText('Nothing left to record right now.')
    expect(savedBody).toMatchObject({ pengim: 'da1', consentAcknowledged: true, mimeType: 'audio/webm;codecs=opus' })
    expect(savedBody).not.toHaveProperty('speaker')
    expect(typeof savedBody?.audioBase64).toBe('string')
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
          return Promise.resolve(new Response(JSON.stringify({ published: {}, pending: [PENDING.pengim] }), { status: 200 }))
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
