import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSrsQueue } from './useSrsQueue'
import { makeEntry } from '../test/entryFixtures'
import type { CardState } from '@teochew/core'
import type { EnrichedEntry } from '@teochew/core'

const stored = new Map<string, CardState>()
const put = vi.fn()

vi.mock('./db', () => ({
  getAllCards: () => Promise.resolve(new Map(stored)),
  putCard: (card: CardState) => {
    put(card)
    return Promise.resolve()
  },
}))

function entry(id: string, frequency = 0): EnrichedEntry {
  return makeEntry({ id, headword: id, frequency })
}

/** A fresh array each time, the way FlashcardsView's memo hands one over. */
const pool = (...ids: string[]) => ids.map((id, i) => entry(id, ids.length - i))

function setup(entries: EnrichedEntry[], tableKey = 'table-a') {
  return renderHook(({ e, k }: { e: EnrichedEntry[]; k: string }) => useSrsQueue(e, k), {
    initialProps: { e: entries, k: tableKey },
  })
}

async function ready(result: { current: { loading: boolean } }) {
  await waitFor(() => expect(result.current.loading).toBe(false))
}

beforeEach(() => {
  stored.clear()
  put.mockClear()
})

describe('useSrsQueue', () => {
  it('deals a card once the stored states have loaded', async () => {
    const { result } = setup(pool('a', 'b', 'c'))
    expect(result.current.loading).toBe(true)
    await ready(result)
    expect(result.current.current?.entryId).toBe('a')
    expect(result.current.totalCount).toBe(3)
  })

  describe('holding the drawn card', () => {
    it('keeps it when the pool is handed over as a new array with the same contents', async () => {
      const { result, rerender } = setup(pool('a', 'b', 'c'))
      await ready(result)
      const drawn = result.current.current?.entryId

      rerender({ e: pool('a', 'b', 'c'), k: 'table-a' })

      expect(result.current.current?.entryId).toBe(drawn)
    })

    it('keeps it when the pool grows, and queues the newcomers behind it', async () => {
      const { result, rerender } = setup(pool('a', 'b'))
      await ready(result)
      const drawn = result.current.current?.entryId

      rerender({ e: pool('a', 'b', 'c'), k: 'table-a' })

      expect(result.current.current?.entryId).toBe(drawn)
      expect(result.current.totalCount).toBe(3)
    })

    it('keeps it when the pool shrinks around it', async () => {
      const { result, rerender } = setup(pool('a', 'b', 'c'))
      await ready(result)
      const drawn = result.current.current?.entryId

      rerender({ e: pool('a', 'b'), k: 'table-a' })

      expect(result.current.current?.entryId).toBe(drawn)
    })

    it('adds nothing when the pool shrinks — hiding cards should not hand you more', async () => {
      const { result, rerender } = setup(pool('a', 'b', 'c'))
      await ready(result)

      rerender({ e: pool('a', 'b'), k: 'table-a' })

      expect(result.current.totalCount).toBe(2)
    })

    it('replaces it only when it is the card that became ineligible', async () => {
      const { result, rerender } = setup(pool('a', 'b', 'c'))
      await ready(result)
      expect(result.current.current?.entryId).toBe('a')

      rerender({ e: pool('b', 'c'), k: 'table-a' })

      expect(result.current.current?.entryId).toBe('b')
    })

    it('refills once the queue has been emptied and the pool comes back', async () => {
      const { result, rerender } = setup(pool('a', 'b'))
      await ready(result)

      rerender({ e: [], k: 'table-a' })
      expect(result.current.current).toBeNull()

      rerender({ e: pool('a', 'b'), k: 'table-a' })
      expect(result.current.current?.entryId).toBe('a')
    })
  })

  describe('grading', () => {
    it('moves to the next card and counts the review', async () => {
      const { result } = setup(pool('a', 'b'))
      await ready(result)

      act(() => result.current.grade('good'))

      expect(result.current.current?.entryId).toBe('b')
      expect(result.current.reviewedCount).toBe(1)
      expect(put).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'a' }))
    })

    it('sends an "again" card to the back of the same session', async () => {
      const { result } = setup(pool('a', 'b'))
      await ready(result)

      act(() => result.current.grade('again'))

      expect(result.current.current?.entryId).toBe('b')
      act(() => result.current.grade('good'))
      expect(result.current.current?.entryId).toBe('a')
    })

    it('does nothing when there is no card to grade', async () => {
      const { result } = setup([])
      await ready(result)
      act(() => result.current.grade('good'))
      expect(put).not.toHaveBeenCalled()
    })
  })

  describe('one session per table', () => {
    it('deals a separate card for a different table', async () => {
      const { result, rerender } = setup(pool('a', 'b'), 'table-a')
      await ready(result)
      act(() => result.current.grade('good'))
      expect(result.current.current?.entryId).toBe('b')

      rerender({ e: pool('x', 'y'), k: 'table-b' })

      expect(result.current.current?.entryId).toBe('x')
      expect(result.current.reviewedCount).toBe(0)
    })

    it('resumes the first table where it was left', async () => {
      const { result, rerender } = setup(pool('a', 'b'), 'table-a')
      await ready(result)
      act(() => result.current.grade('good'))

      rerender({ e: pool('x', 'y'), k: 'table-b' })
      rerender({ e: pool('a', 'b'), k: 'table-a' })

      expect(result.current.current?.entryId).toBe('b')
      expect(result.current.reviewedCount).toBe(1)
    })

    it('keeps each table\'s progress separate', async () => {
      const { result, rerender } = setup(pool('a', 'b', 'c'), 'table-a')
      await ready(result)
      act(() => result.current.grade('good'))
      act(() => result.current.grade('good'))

      rerender({ e: pool('x', 'y'), k: 'table-b' })
      act(() => result.current.grade('good'))
      expect(result.current.reviewedCount).toBe(1)

      rerender({ e: pool('a', 'b', 'c'), k: 'table-a' })
      expect(result.current.reviewedCount).toBe(2)
    })
  })

  it('reports what is left as the total less what has been reviewed', async () => {
    const { result } = setup(pool('a', 'b', 'c'))
    await ready(result)
    act(() => result.current.grade('good'))

    expect(result.current.totalCount - result.current.reviewedCount).toBe(2)
  })
})
