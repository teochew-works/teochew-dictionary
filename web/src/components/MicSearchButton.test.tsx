import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MicSearchButton } from './MicSearchButton'

// jsdom's Blob has no arrayBuffer() (unlike every real browser) — FileReader
// is the one jsdom API that can actually read one back out. Same polyfill as
// RecordClipButton.test.tsx.
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

// The DSP math (FFT/MFCC/DTW) is unit-tested directly in packages/core; here
// we only need a controllable stand-in so this file can test the component's
// wiring (record → decode → rank → surface results) without depending on
// real audio math or on jsdom having a Web Audio API. `dtwDistance`'s
// "distance" is just the one number each fake reference clip carries, so the
// expected ranking is obvious from the fixture data.
vi.mock('@teochew/core', () => ({
  extractMfccFromSamples: vi.fn(() => [[0]]),
  dtwDistance: vi.fn((_query: number[][], ref: number[][]) => ref[0]![0]!),
}))

// `loadSearchBank` memoizes its fetch at module scope (deliberately — see its
// own doc comment), which would leak one test's fixture into the next if we
// stubbed `fetch` instead. Mocking this module directly gives each test its
// own controllable resolution/rejection without fighting that memoization.
vi.mock('../search/speakToSearchBank', () => ({
  loadSearchBank: vi.fn(),
}))
import { loadSearchBank } from '../search/speakToSearchBank'

function stubBank(mfccByKey: Record<string, number[][]>) {
  const clips = Object.fromEntries(
    Object.entries(mfccByKey).map(([key, mfcc]) => [key, { mfcc, onsetMs: null, f0Contour: null }]),
  )
  vi.mocked(loadSearchBank).mockResolvedValue({
    version: 2,
    mfccParams: { frameMs: 25, hopMs: 10, nMels: 40, nMfcc: 1, silenceDb: -30 },
    featuresParams: { frameMs: 5, f0FloorHz: 60, f0CeilHz: 400, silenceDb: -30 },
    speaker: 'jky',
    variety: 'chaozhou',
    clips,
  })
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

class FakeAudioContext {
  async decodeAudioData(_buffer: ArrayBuffer) {
    return {
      numberOfChannels: 1,
      length: 4,
      sampleRate: 48000,
      getChannelData: () => new Float32Array(4),
    } as unknown as AudioBuffer
  }

  close() {
    return Promise.resolve()
  }
}

function stubMedia() {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { getUserMedia }
}

async function recordAClip() {
  fireEvent.click(screen.getByRole('button', { name: 'Speak to search' }))
  await screen.findByRole('button', { name: 'Stop recording' })
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
}

describe('MicSearchButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ranks candidates by ascending distance and reports the closest as the result', async () => {
    stubMedia()
    stubBank({ far: [[9]], close: [[1]], closest: [[0]] })
    const onResult = vi.fn()
    render(<MicSearchButton onResult={onResult} />)

    await recordAClip()

    await screen.findByRole('group', { name: 'Recognised syllables' })
    const chips = screen.getAllByRole('button', { name: /^(far|close|closest)$/ })
    expect(chips.map((c) => c.textContent)).toEqual(['closest', 'close', 'far'])
    expect(onResult).toHaveBeenCalledWith('closest')
  })

  it('lets a candidate chip be picked directly', async () => {
    stubMedia()
    stubBank({ a: [[1]], b: [[0]] })
    const onResult = vi.fn()
    render(<MicSearchButton onResult={onResult} />)

    await recordAClip()
    await screen.findByRole('group', { name: 'Recognised syllables' })
    onResult.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'a' }))
    expect(onResult).toHaveBeenCalledWith('a')
  })

  it('shows an inline error when the microphone cannot be accessed', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new Error('Permission denied')
    })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    render(<MicSearchButton onResult={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Speak to search' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  })

  it('shows an inline error when the reference bank cannot be fetched', async () => {
    stubMedia()
    vi.mocked(loadSearchBank).mockRejectedValue(new Error('no speak-to-search reference bank (HTTP 404)'))

    render(<MicSearchButton onResult={vi.fn()} />)
    await recordAClip()

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 404/)
  })
})
