import { useEffect, useState } from 'react'
import type { SoundsData } from '../types/sounds'

export interface SoundsState {
  data: SoundsData | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the synced dist/sounds.json once on mount. Mirrors useDictionary:
 * goes through BASE_URL so it also resolves under the GitHub Pages subpath.
 * Only ever called from SoundsView, which only mounts once the Sounds tab is
 * selected — so this fetch is naturally lazy, not paid by every visit.
 */
export function useSounds(): SoundsState {
  const [state, setState] = useState<SoundsState>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false

    fetch(`${import.meta.env.BASE_URL}data/sounds.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
        return res.json() as Promise<SoundsData>
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
  }, [])

  return state
}
