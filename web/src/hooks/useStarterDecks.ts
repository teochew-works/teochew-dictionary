import { useEffect, useRef, useState } from 'react'
import type { StarterDecksCatalog } from '../types/starter-decks'

export interface StarterDecksState {
  data: StarterDecksCatalog | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the synced dist/starter-decks.json the first time `enabled` turns
 * true, and never re-fetches after that — mirrors useSyllableChart, gated
 * because the catalog is only needed once the Marketplace pane is opened.
 */
export function useStarterDecks(enabled: boolean): StarterDecksState {
  const [state, setState] = useState<StarterDecksState>({ data: null, loading: false, error: null })
  const startedRef = useRef(false)

  useEffect(() => {
    if (!enabled || startedRef.current) return
    startedRef.current = true
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))

    fetch(`${import.meta.env.BASE_URL}data/starter-decks.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
        return res.json() as Promise<StarterDecksCatalog>
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setState({ data: null, loading: false, error: message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
