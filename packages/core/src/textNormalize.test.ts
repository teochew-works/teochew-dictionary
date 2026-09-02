import { describe, expect, it } from 'vitest'
import { stripDiacritics, stripTones } from './textNormalize.js'

describe('stripTones', () => {
  it('strips tone digits from every syllable', () => {
    expect(stripTones('dio5 ziu1')).toBe('dio ziu')
  })

  it('leaves a string with no tone digits unchanged', () => {
    expect(stripTones('dio ziu')).toBe('dio ziu')
  })
})

describe('stripDiacritics', () => {
  it('strips combining diacritics from POJ', () => {
    expect(stripDiacritics('tiô-tsiu')).toBe('tio-tsiu')
  })

  it('leaves a string with no diacritics unchanged', () => {
    expect(stripDiacritics('tio-tsiu')).toBe('tio-tsiu')
  })
})
