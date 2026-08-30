import { useEffect, useState } from 'react'
import { disableDictOffline, enableDictOffline, fetchDictSize, isDictAvailableOffline } from './offlineData'

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * "Available offline" for the dictionary's 41MB dict.json (mobile.md §9) —
 * the one piece of data explicitly *not* precached by the service worker
 * (vite.config.ts). Names the size before committing to it, since writing
 * that much to someone's phone without asking is the thing this is opting
 * out of by default.
 */
export function OfflineDataToggle() {
  const [checked, setChecked] = useState(false)
  const [size, setSize] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void isDictAvailableOffline().then((v) => {
      if (!cancelled) setChecked(v)
    })
    void fetchDictSize().then((v) => {
      if (!cancelled) setSize(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function toggle(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (next) await enableDictOffline()
      else await disableDictOffline()
      setChecked(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="settings-view__toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Available offline{size !== null && ` (${formatSize(size)})`}
        {busy && ' — saving…'}
      </label>
      {error && <p className="settings-view__backup-status settings-view__backup-status--error">{error}</p>}
    </div>
  )
}
