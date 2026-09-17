/** Shared by every flow that POSTs a recorded blob to `/api/local-recordings`. */

/** Chunked to avoid the call-stack overflow a single `String.fromCharCode(...bytes)` spread risks on a large clip. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
