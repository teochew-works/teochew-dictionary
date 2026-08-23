import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecordClipButton } from './RecordClipButton'

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
  return { getUserMedia }
}

function stubSaveFetch(response: { ok: boolean; error?: string } = { ok: true }) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(response), { status: response.ok ? 200 : 400 })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function recordAClip() {
  fireEvent.click(screen.getByRole('button', { name: '● Start recording' }))
  await screen.findByRole('button', { name: '■ Stop' })
  fireEvent.click(screen.getByRole('button', { name: '■ Stop' }))
  await screen.findByRole('button', { name: 'Save to staging' })
}

describe('RecordClipButton', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows Record for a syllable with no clip, and opens a panel on click', () => {
    stubMedia()
    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('group', { name: 'Record a clip for dio5' })).toBeInTheDocument()
  })

  it.each([
    ['pending', 'Pending review'],
    ['published', 'Re-record'],
  ] as const)('shows %s status as "%s"', (status, label) => {
    stubMedia()
    render(<RecordClipButton pengim="dio5" status={status} onSaved={vi.fn()} />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  it('disables Save until a speaker id and consent are both given', async () => {
    stubMedia()
    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await recordAClip()

    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Speaker id'), { target: { value: 'speaker-1' } })
    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeEnabled()
  })

  it('lets a recording be discarded and re-recorded before saving', async () => {
    stubMedia()
    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await recordAClip()

    fireEvent.click(screen.getByRole('button', { name: 'Re-record' }))
    expect(screen.getByRole('button', { name: '● Start recording' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save to staging' })).not.toBeInTheDocument()
  })

  it('POSTs the recording and reports success once consent and speaker are given', async () => {
    stubMedia()
    const fetchMock = stubSaveFetch()
    const onSaved = vi.fn()
    render(<RecordClipButton pengim="dio5" status="none" onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await recordAClip()

    fireEvent.change(screen.getByLabelText('Speaker id'), { target: { value: 'speaker-1' } })
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))

    await screen.findByText('Saved — pending review')
    expect(onSaved).toHaveBeenCalledWith('dio5')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/local-recordings',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).toMatchObject({
      pengim: 'dio5',
      speaker: 'speaker-1',
      consentAcknowledged: true,
      mimeType: 'audio/webm;codecs=opus',
    })
    expect(typeof body.audioBase64).toBe('string')
    expect(body.audioBase64.length).toBeGreaterThan(0)

    expect(localStorage.getItem('teochew-dictionary:recording-speaker-id')).toBe('speaker-1')
  })

  it('shows an inline error and stays on the preview when the save request fails', async () => {
    stubMedia()
    stubSaveFetch({ ok: false, error: 'consentAcknowledged must be true' })
    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await recordAClip()

    fireEvent.change(screen.getByLabelText('Speaker id'), { target: { value: 'speaker-1' } })
    fireEvent.click(screen.getByLabelText(/AUDIO-CONSENT\.md/))
    fireEvent.click(screen.getByRole('button', { name: 'Save to staging' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('consentAcknowledged must be true')
    expect(screen.getByRole('button', { name: 'Save to staging' })).toBeInTheDocument()
  })

  it('shows an inline error when the microphone cannot be accessed', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error('Permission denied')
    })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    fireEvent.click(screen.getByRole('button', { name: '● Start recording' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  })

  it('closes the panel and discards an in-progress recording', async () => {
    stubMedia()
    render(<RecordClipButton pengim="dio5" status="none" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await recordAClip()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument())
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
