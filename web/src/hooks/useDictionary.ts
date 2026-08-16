import { useEffect, useState } from 'react'
import type { Dict } from '../types/dict'

export interface DictionaryState {
  data: Dict | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the synced dist/dict.json once on mount. Always goes through
 * BASE_URL (Vite's build-time `base`) rather than a hardcoded path, since the
 * app is served from a subpath on GitHub Pages — see vite.config.ts.
 */
export function useDictionary(): DictionaryState {
  const [state, setState] = useState<DictionaryState>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false

    fetch(`${import.meta.env.BASE_URL}data/dict.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
        return res.json() as Promise<Dict>
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
