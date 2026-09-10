let registration: ServiceWorkerRegistration | undefined

export function setRegistration(next: ServiceWorkerRegistration | undefined) {
  registration = next
}

/**
 * Forces the browser to re-fetch the service worker script and compare it
 * byte-for-byte, instead of waiting on the browser's own ~24h background poll
 * — the thing an installed home-screen app or a tab left open across a deploy
 * may otherwise never trigger on its own. A found update still surfaces
 * through the normal `UpdatePrompt` banner; this only makes the check itself
 * happen sooner.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false
  await registration.update()
  return true
}
