/** Strip tone digits: `dio5 ziu1` → `dio ziu`. Users rarely type tones. */
export function stripTones(pengim: string): string {
  return pengim.replace(/[1-8]/gu, '')
}

/** Strip combining diacritics from POJ so `tio` finds `tiô`. */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}
