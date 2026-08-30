import { useRegisterSW } from 'virtual:pwa-register/react'
import './UpdatePrompt.css'

/**
 * The service worker precaches the shell (vite.config.ts), so a stale tab
 * left open across a deploy would otherwise be stranded on it forever with
 * no way back short of a manual hard refresh. `registerType: 'prompt'`
 * leaves the decision of *when* to a person instead of reloading out from
 * under whatever they're doing — a silent reload mid flashcard review would
 * drop the session (mobile.md §4).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="update-prompt" role="status">
      <span>An update is available.</span>
      <button type="button" className="update-prompt__reload" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button
        type="button"
        className="update-prompt__dismiss"
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
      >
        ✕
      </button>
    </div>
  )
}
