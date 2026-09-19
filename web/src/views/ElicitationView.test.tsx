import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
 * Only `TARGET` needs a second session (jky has a lone clip and no merged
 * second take yet, via the dist-fallback path since no test here overrides
 * `published` for it). Every other fixture sound's clip has no `speaker` at
 * all — it has *some* real recording, so it's a valid axis reference, but no
 * clip attributed to jky, so it's automatically out of jky's pool without
 * needing a live `published` payload to explain why. `TARGET`'s axis-mates
 * are each engineered to match exactly one of initial/rime/tone, so every
 * reference group has exactly one candidate — no `Math.random` mocking
 * needed anywhere in this file.
 *
 * A handful of dedicated tests below exercise the live take/primary payload
 * directly (`secondSessionDone`) — that's the only way to represent "jky's
 * second take is already merged", since `sounds.json`'s dist-fallback clips
 * (used here) already collapse to one clip per speaker (ADR-0029) and so
 * can never themselves show a merged non-primary take.
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

/**
 * A `published` entry (ADR-0029) representing a syllable where jky's second
 * take has already been merged: the original take (now non-primary) is
 * listed *before* the take a human later re-designated primary via
 * `--primary` — array order doesn't track which one is primary, so any code
 * that assumes `[0]` is primary gets this one wrong.
 */
function secondSessionDone(pengim: string) {
  return [
    { url: `${pengim}-take1.wav`, speaker: 'jky', primary: false },
    { url: `${pengim}-take2.wav`, speaker: 'jky', take: 2, primary: true },
  ]
}

const SAME_INITIAL = {
  pengim: 'do2',
  ipa: 'do⁵³',
  initial: 'd',
  rime: 'o',
  tone: 2,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'ref-initial.wav' }],
}

const SAME_RIME = {
  pengim: 'ba5',
  ipa: 'ba²¹³',
  initial: 'b',
  rime: 'a',
  tone: 5,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'ref-rime.wav' }],
}

const SAME_TONE = {
  pengim: 'bi1',
  ipa: 'bi³³',
  initial: 'b',
  rime: 'i',
  tone: 1,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'ref-tone.wav' }],
}

const ALREADY_DONE = {
  pengim: 'zo8',
  ipa: 'zo¹¹',
  initial: 'z',
  rime: 'o',
  tone: 8,
  occurrences: 1,
  examples: [],
  clips: [{ url: 'done.wav' }],
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

/** Four same-initial candidates (more than MAX_REFERENCES_PER_AXIS), each with its own example character. No `speaker`, same reasoning as `SAME_INITIAL` above. */
const MANY_SAME_INITIAL = ['do2', 'do3', 'do4', 'do5'].map((pengim, i) => ({
  pengim,
  ipa: `${pengim}-ipa`,
  initial: 'd',
  rime: ['o', 'u', 'e', 'ai'][i]!,
  tone: i + 2,
  occurrences: 1,
  examples: [{ headword: `字${i}`, pengim, gloss: 'x' }],
  clips: [{ url: `${pengim}.wav` }],
}))

function stubFetch(
  data: SoundsData,
  opts: { onSave?: (body: unknown) => void; published?: Record<string, unknown[]> } = {},
) {
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
          new Response(JSON.stringify({ published: opts.published ?? {}, pending: [], staged: {} }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }),
  )
}

/** Simulates a live staging store: DELETE actually removes from the map returned by the next GET. */
function stubFetchWithStaged(
  data: SoundsData,
  initialStaged: Record<string, { localPath: string; recordedDate: string }[]>,
  published: Record<string, unknown[]> = {},
) {
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
      return Promise.resolve(new Response(JSON.stringify({ published, pending: [], staged }), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function referenceRow(label: string): HTMLElement {
  return screen.getByText(label).closest<HTMLElement>('.elicitation-view__reference')!
}

/** Reads the count shown for a histogram bucket, e.g. `histogramCount('1 recording')`. */
function histogramCount(label: string): number {
  const bucket = screen.getByText(label).closest<HTMLElement>('.elicitation-view__histogram-bucket')!
  return Number(bucket.querySelector('.elicitation-view__histogram-count')!.textContent)
}

function axisCoverageValue(axisLabel: string): string | null {
  const item = screen.getByText(axisLabel).closest<HTMLElement>('.elicitation-view__axis-coverage-item')!
  return item.querySelector('.elicitation-view__axis-coverage-value')!.textContent
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
    vi.restoreAllMocks()
  })

  it('shows the one syllable that needs a second session, and a recording-count histogram', async () => {
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    expect(await screen.findByText('da1')).toBeInTheDocument()
    expect(screen.queryByText('zo8')).not.toBeInTheDocument()
    expect(screen.queryByText('never1')).not.toBeInTheDocument()

    // Nobody has staged anything in this fixture — the histogram counts
    // staged takes only, not jky's first-session baseline every pool
    // syllable already has (see the staged-take test below for a non-zero bucket).
    expect(histogramCount('0 staged recordings')).toBe(6)
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
  })

  it('excludes a syllable from the pool once jky has a merged (non-primary) second take (ADR-0029)', async () => {
    const DONE = { pengim: 'ku3', ipa: 'ku³³', initial: 'k', rime: 'u', tone: 3, occurrences: 1, examples: [], clips: [] }
    stubFetch({ variety: 'chaozhou', sounds: [DONE] }, { published: { ku3: secondSessionDone('ku3') } })
    render(<ElicitationView />)

    expect(await screen.findByText('Nothing left to record right now.')).toBeInTheDocument()
  })

  it('keeps a syllable with a lone jky (primary) clip in the pool', async () => {
    const ALONE = { pengim: 'ta1', ipa: 'ta³³', initial: 't', rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [] }
    stubFetch({ variety: 'chaozhou', sounds: [ALONE] }, { published: { ta1: [{ url: 'a.wav', speaker: 'jky', primary: true }] } })
    render(<ElicitationView />)

    expect(await screen.findByText('ta1')).toBeInTheDocument()
  })

  it('plays the primary take as an axis reference clip, even when it is not first in the list', async () => {
    const played: string[] = []
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      played.push(this.src)
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    // REF shares TARGET's initial ('d') and is the only "Same initial" candidate.
    const ref = { pengim: 'do2', ipa: 'do⁵³', initial: 'd', rime: 'o', tone: 2, occurrences: 1, examples: [], clips: [] }
    stubFetch(
      { variety: 'chaozhou', sounds: [TARGET, ref] },
      {
        published: {
          da1: [{ url: 'target.wav', speaker: 'jky', primary: true }],
          do2: [
            { url: 'https://x.test/do2-take1.wav', speaker: 'jky', primary: false },
            { url: 'https://x.test/do2-take2.wav', speaker: 'jky', take: 2, primary: true },
          ],
        },
      },
    )
    render(<ElicitationView />)

    await screen.findByText('da1')
    const playButton = screen.getByLabelText('Play reference recording do2')
    fireEvent.click(playButton)

    expect(played.some((src) => src.includes('do2-take2.wav'))).toBe(true)
    expect(played.some((src) => src.includes('do2-take1.wav'))).toBe(false)
  })

  it('a syllable with a staged-but-unmerged take stays in the pool and shows its staged takes', async () => {
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [TARGET] },
      { da1: [{ localPath: 'data/staging/recordings/chaozhou/da1__unassigned__abc.webm', recordedDate: '2026-09-15' }] },
    )
    render(<ElicitationView />)

    expect(await screen.findByText('da1')).toBeInTheDocument()
    expect(screen.getByText('Staged take for da1')).toBeInTheDocument()
    expect(screen.getByText('2026-09-15')).toBeInTheDocument()

    // The histogram counts the staged take (staging-only, not jky's
    // first-session baseline), even though da1 is still in the pickable pool
    // (only a published second take would remove it from there).
    expect(histogramCount('1 staged recording')).toBe(1)
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

    const firstEl = await screen.findByText(/^(ra1|sb2)$/)
    const pengimEl = () => document.querySelector('.elicitation-view__target-pengim')?.textContent
    const first = firstEl.textContent

    fireEvent.click(screen.getByRole('button', { name: 'Re-pick' }))

    expect(pengimEl()).not.toBe(first)
    expect(['ra1', 'sb2']).toContain(pengimEl())

    // With only one other candidate, re-picking again must cycle back to the
    // original — proving it was never excluded from the pool by the first re-pick.
    fireEvent.click(screen.getByRole('button', { name: 'Re-pick' }))
    expect(pengimEl()).toBe(first)
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

  it('shows up to MAX_REFERENCES_PER_AXIS random samples per axis, each with its own common character, when more are available', async () => {
    stubFetch({ variety: 'chaozhou', sounds: [TARGET, ...MANY_SAME_INITIAL] })
    render(<ElicitationView />)

    await screen.findByText('da1')
    const initialRow = referenceRow('Same initial')
    const samplePengim = within(initialRow).getAllByText(/^do[2-5]$/)
    // Capped at 3 even though 4 candidates exist.
    expect(samplePengim).toHaveLength(3)

    const characters = within(initialRow).getAllByText(/^字[0-3]$/)
    expect(characters).toHaveLength(3)
  })

  it('omits the common character for a sample with no examples', async () => {
    stubFetch(FULL_FIXTURE)
    render(<ElicitationView />)

    await screen.findByText('da1')
    const initialRow = referenceRow('Same initial')
    expect(within(initialRow).getByText('do2')).toBeInTheDocument()
    expect(initialRow.querySelector('.elicitation-view__reference-character')).not.toBeInTheDocument()
  })

  it('does not reselect axis samples on an unrelated re-render (e.g. playing a clip) — only when the target changes', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    stubFetch({ variety: 'chaozhou', sounds: [TARGET, ...MANY_SAME_INITIAL] })
    render(<ElicitationView />)

    await screen.findByText('da1')
    const before = within(referenceRow('Same initial')).getAllByText(/^do[2-5]$/).map((el) => el.textContent)

    fireEvent.click(screen.getByLabelText('Play your existing recording of da1'))

    const after = within(referenceRow('Same initial')).getAllByText(/^do[2-5]$/).map((el) => el.textContent)
    expect(after).toEqual(before)
  })

  it('weights the initial pick toward a target with fewer staged takes', async () => {
    const A = { pengim: 'wa1', ipa: 'wa³³', initial: 'w', rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [{ url: 'a.wav', speaker: 'jky' }] }
    const B = { pengim: 'wb2', ipa: 'wb⁵³', initial: 'x', rime: 'e', tone: 2, occurrences: 1, examples: [], clips: [{ url: 'b.wav', speaker: 'jky' }] }
    // weight(A) = 1/(0+1) = 1, weight(B) = 1/(5+1) ≈ 0.167, total ≈ 1.167 —
    // a mid-range roll lands within A's much larger share of that total.
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [A, B] },
      { wb2: Array.from({ length: 5 }, (_, i) => ({ localPath: `p${i}`, recordedDate: '2026-09-15' })) },
    )
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    render(<ElicitationView />)

    expect(await screen.findByText('wa1')).toBeInTheDocument()
  })

  it('weights picking toward a target whose axis components have had less staged attention', async () => {
    const RARE = { pengim: 'rb2', ipa: 'rb⁵³', initial: 'r', rime: 'b', tone: 2, occurrences: 1, examples: [], clips: [{ url: 'r.wav', speaker: 'jky' }] }
    const COMMON = { pengim: 'ca1', ipa: 'ca³³', initial: 'c', rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [{ url: 'c.wav', speaker: 'jky' }] }
    const filler = (pengim: string, initial: string, rime: string, tone: number) => ({
      pengim,
      ipa: `${pengim}-ipa`,
      initial,
      rime,
      tone,
      occurrences: 1,
      examples: [],
      // No jky clip at all, so these are automatically out of jky's pool and
      // never compete with COMMON/RARE for the pick themselves — they only
      // exist to carry a staged take that inflates COMMON's axis-staged counts.
      clips: [],
    })
    // Three other staged syllables share COMMON's initial, three share its
    // rime, three share its tone — none share anything with RARE. Neither
    // COMMON nor RARE has any staged takes of its own.
    const fillers = [
      filler('cx1', 'c', 'x', 3),
      filler('cy1', 'c', 'y', 4),
      filler('cz1', 'c', 'z', 5),
      filler('xa1', 'x', 'a', 3),
      filler('ya1', 'y', 'a', 4),
      filler('za1', 'z', 'a', 5),
      filler('p1', 'p', 'n', 1),
      filler('q1', 'q', 'o', 1),
      filler('s1', 's', 'p', 1),
    ]
    // weight(COMMON) = 1 * (1/4 · 1/4 · 1/4) ≈ 0.0156, weight(RARE) = 1 * (1/1 · 1/1 · 1/1) = 1,
    // total ≈ 1.0156 — all but a sliver of that range favors RARE.
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [COMMON, RARE, ...fillers] },
      Object.fromEntries(fillers.map((f) => [f.pengim, [{ localPath: `${f.pengim}.webm`, recordedDate: '2026-09-15' }]])),
    )
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    render(<ElicitationView />)

    expect(await screen.findByText('rb2')).toBeInTheDocument()
  })

  it('shows the percentage of each axis\'s distinct values with at least one staged recording', async () => {
    // Two initials ('c','d'), two rimes ('a','o'), two tones (1,2) exist;
    // only initial 'c' and tone 1 have any staged take.
    const sounds = [
      { pengim: 'ca1', ipa: 'ca1-ipa', initial: 'c', rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [{ url: 'x.wav', speaker: 'jky' }] },
      { pengim: 'do2', ipa: 'do2-ipa', initial: 'd', rime: 'o', tone: 2, occurrences: 1, examples: [], clips: [{ url: 'y.wav', speaker: 'jky' }] },
    ]
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds },
      { ca1: [{ localPath: 'ca1.webm', recordedDate: '2026-09-15' }] },
    )
    render(<ElicitationView />)

    // The axis-coverage summary renders as soon as the data loads — it
    // doesn't depend on which specific syllable ends up as the current pick.
    await screen.findByText('Initial')
    expect(axisCoverageValue('Initial')).toBe('1/2 (50%) staged')
    expect(axisCoverageValue('Rime')).toBe('1/2 (50%) staged')
    expect(axisCoverageValue('Tone')).toBe('1/2 (50%) staged')
  })

  it('lets a staged take be played back', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    stubFetchWithStaged(
      { variety: 'chaozhou', sounds: [TARGET] },
      { da1: [{ localPath: 'data/staging/recordings/chaozhou/da1__unassigned__abc.webm', recordedDate: '2026-09-15' }] },
    )
    render(<ElicitationView />)

    const playButton = await screen.findByRole('button', { name: 'Play staged take 1 of da1' })
    fireEvent.click(playButton)

    expect(playButton).toHaveAttribute('aria-pressed', 'true')
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
