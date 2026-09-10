import { useState } from 'react'
import { checkForUpdate } from './registration'

type Status = 'idle' | 'checking' | 'checked' | 'unavailable'

/**
 * A manual trigger for the same update check the browser otherwise only runs
 * on its own ~24h schedule — an installed home-screen app or a tab left open
 * across a deploy can go a long time without ever hitting that, leaving
 * someone stuck on stale JS with no visible sign why.
 */
export function CheckForUpdate() {
  const [status, setStatus] = useState<Status>('idle')

  async function check() {
    setStatus('checking')
    const ok = await checkForUpdate()
    setStatus(ok ? 'checked' : 'unavailable')
  }

  return (
    <div>
      <button
        type="button"
        className="settings-view__button"
        disabled={status === 'checking'}
        onClick={() => void check()}
      >
        {status === 'checking' ? 'Checking…' : 'Check for updates'}
      </button>
      {status === 'checked' && (
        <p className="settings-view__hint" role="status">
          Checked — an update banner will appear above if one was found.
        </p>
      )}
      {status === 'unavailable' && (
        <p className="settings-view__hint" role="status">
          Updates aren't available in this browsing mode.
        </p>
      )}
    </div>
  )
}
