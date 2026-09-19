import { useCallback, useEffect, useState } from 'react'

/** Duplicated from the server-side `PublishedClip` in web/vite-plugins/local-recordings-handlers.ts — web/ has no access to the root project's types. */
export interface PublishedClip {
  url: string
  speaker?: string
  /** Set when the clip is a re-rendering of a recording (ADR-0027); the play button labels it. */
  synthesis?: 'world-retune' | 'cross-splice'
  /** Which take of this syllable by this speaker (ADR-0029) — absent means their first take. */
  take?: number
  /**
   * Whether this is the one clip of its speaker's that leaves `data/` (ADR-0029) — computed
   * server-side. `getStatus` always sets this explicitly; optional only so a plain `{ url }`
   * literal (e.g. a staged, not-yet-merged take) still satisfies this type elsewhere in `web/`.
   */
  primary?: boolean
}

/** Duplicated from the server-side `StagedClip` — see `PublishedClip`'s comment above. */
export interface StagedClip {
  localPath: string
  recordedDate: string
}

export interface LocalRecordingsStatus {
  published: Map<string, PublishedClip[]>
  pending: Set<string>
  /** Every staged (not yet merged) proposal, by syllable — a syllable can have more than one (issue #288). */
  staged: Map<string, StagedClip[]>
  /** Re-fetches the status — call after staging or deleting a proposal so the UI reflects it immediately. */
  refresh: () => void
}

interface StatusResponse {
  published?: Record<string, PublishedClip[]>
  pending?: string[]
  staged?: Record<string, StagedClip[]>
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
  const [status, setStatus] = useState<Omit<LocalRecordingsStatus, 'refresh'> | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false

    fetch('/api/local-recordings')
      .then((res) => (res.ok ? (res.json() as Promise<StatusResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setStatus({
          published: new Map(Object.entries(data.published ?? {})),
          pending: new Set(data.pending ?? []),
          staged: new Map(Object.entries(data.staged ?? {})),
        })
      })
      .catch(() => {
        // Dev-only convenience data — if it's unavailable, rows just render without a badge.
      })

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  return status ? { ...status, refresh } : null
}
