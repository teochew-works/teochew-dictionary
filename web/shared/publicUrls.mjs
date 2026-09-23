/** A reversible, case-insensitive-filesystem-safe encoding of the exact entry ID. */
export function entryKey(id) {
  if (!id) throw new Error('entry ID must not be empty')
  return `e-${Array.from(new TextEncoder().encode(id), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function siteBase(base) {
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('//') || base.includes('..')) {
    throw new Error(`invalid site base: ${base}`)
  }
  return base
}

export function entryPath(id, base) {
  return `${siteBase(base)}entry/${entryKey(id)}/`
}

export function browsePath(page, base) {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error(`invalid browse page: ${page}`)
  return `${siteBase(base)}browse/${page}/`
}
