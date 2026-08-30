import { useEffect, useState } from 'react'

/** Non-standard — Chromium ships it, it isn't in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  // iOS Safari never fires the (also non-standard) 'display-mode: standalone'
  // media query change reliably at launch, but does expose this property —
  // the two together cover installed PWAs on every platform this app ships to.
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

/** Heuristic, not feature-detected — there's no capability query for "is this iOS Safari". */
function isIOSSafari(): boolean {
  const ua = window.navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIOS && isSafari
}

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` when the manifest + service
 * worker + icons make the page installable, and it's the only way to trigger
 * the native install flow programmatically — a real button here rather than
 * a nag banner (mobile.md §4). iOS Safari never fires it at all; there, the
 * closest thing to an install button is telling someone where the real one
 * lives (Share → Add to Home Screen).
 */
export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) {
    return <p className="settings-view__hint">Installed — your review history is exempt from Safari/Chrome's storage cleanup.</p>
  }

  if (installEvent) {
    return (
      <button
        type="button"
        className="settings-view__button"
        onClick={async () => {
          await installEvent.prompt()
          const { outcome } = await installEvent.userChoice
          if (outcome === 'accepted') setInstallEvent(null)
        }}
      >
        Install app
      </button>
    )
  }

  if (isIOSSafari()) {
    return (
      <p className="settings-view__hint">
        To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.
      </p>
    )
  }

  return null
}
