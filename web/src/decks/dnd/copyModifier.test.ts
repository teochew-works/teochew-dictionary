import { describe, expect, it } from 'vitest'
import { copyModifierName, isCopyModifier, isMacPlatform } from './copyModifier'

describe('isCopyModifier', () => {
  it('is Option on macOS, following Finder', () => {
    expect(isCopyModifier({ altKey: true, ctrlKey: false }, true)).toBe(true)
    expect(isCopyModifier({ altKey: false, ctrlKey: true }, true)).toBe(false)
  })

  it('is Control elsewhere, following File Explorer', () => {
    expect(isCopyModifier({ altKey: false, ctrlKey: true }, false)).toBe(true)
    expect(isCopyModifier({ altKey: true, ctrlKey: false }, false)).toBe(false)
  })

  it('is not held when neither key is', () => {
    expect(isCopyModifier({ altKey: false, ctrlKey: false }, true)).toBe(false)
    expect(isCopyModifier({ altKey: false, ctrlKey: false }, false)).toBe(false)
  })
})

describe('isMacPlatform', () => {
  it('recognises the Apple platforms', () => {
    expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true)
    expect(isMacPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
  })

  it('does not claim Windows or Linux', () => {
    expect(isMacPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(isMacPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })
})

describe('copyModifierName', () => {
  it('names the modifier in the reader own platform terms', () => {
    expect(copyModifierName(true)).toBe('⌥')
    expect(copyModifierName(false)).toBe('Ctrl')
  })
})
