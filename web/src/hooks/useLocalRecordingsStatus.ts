import { useEffect, useState } from 'react'

export interface LocalRecordingsStatus {
  published: Set<string>
  pending: Set<string>
}

interface StatusResponse {
  published?: string[]
  pending?: string[]
}

/**
 * Dev-only: fetches `/api/local-recordings`, the record control's own status
 * endpoint (issue #128, `data/phonology/REVIEW.md` § 17) — served by a Vite
 * middleware that only runs under `vite dev`. Only called from `SoundsView`
 * when `import.meta.env.DEV`, mirroring `useSounds`'s always-fetch shape;
 * this hook itself just no-ops (leaves `status` null forever) outside dev,
 * so a stray call from a non-dev context is harmless rather than an error.
 */
export function useLocalRecordingsStatus(): LocalRecordingsStatus | null {
  const [status, setStatus] = useState<LocalRecordingsStatus | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false

    fetch('/api/local-recordings')
      .then((res) => (res.ok ? (res.json() as Promise<StatusResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setStatus({ published: new Set(data.published ?? []), pending: new Set(data.pending ?? []) })
      })
      .catch(() => {
        // Dev-only convenience data — if it's unavailable, rows just render without a badge.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return status
}
