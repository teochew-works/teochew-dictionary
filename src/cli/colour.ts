/**
 * Shared ANSI colour helpers for CLI output. Colour is enabled only on a
 * real TTY and disabled by the NO_COLOR convention.
 */

const COLOUR = process.stdout.isTTY && !process.env['NO_COLOR']

function c(code: string, s: string): string {
  return COLOUR ? `\x1b[${code}m${s}\x1b[0m` : s
}

export const bold = (s: string): string => c('1', s)
export const dim = (s: string): string => c('2', s)
export const red = (s: string): string => c('31', s)
export const green = (s: string): string => c('32', s)
export const yellow = (s: string): string => c('33', s)
export const cyan = (s: string): string => c('36', s)
