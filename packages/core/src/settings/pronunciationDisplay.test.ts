import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PRONUNCIATION_DISPLAY,
  readPronunciationDisplay,
  visiblePronunciationFields,
  writePronunciationDisplay,
} from './pronunciationDisplay.js'

describe('readPronunciationDisplay / writePronunciationDisplay', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to pengim/ipa/poj/sandhi when nothing is stored', () => {
    expect(readPronunciationDisplay()).toEqual(DEFAULT_PRONUNCIATION_DISPLAY)
  })

  it('round-trips a written subset and order', () => {
    writePronunciationDisplay(['ipa', 'pengim'])
    expect(readPronunciationDisplay()).toEqual(['ipa', 'pengim'])
  })

  it('round-trips a single field', () => {
    writePronunciationDisplay(['sandhi'])
    expect(readPronunciationDisplay()).toEqual(['sandhi'])
  })

  it('falls back to the default on an empty stored array', () => {
    localStorage.setItem('teochew-dictionary:pronunciation-display', JSON.stringify([]))
    expect(readPronunciationDisplay()).toEqual(DEFAULT_PRONUNCIATION_DISPLAY)
  })

  it('falls back to the default on an invalid stored value', () => {
    localStorage.setItem('teochew-dictionary:pronunciation-display', JSON.stringify(['not-a-field']))
    expect(readPronunciationDisplay()).toEqual(DEFAULT_PRONUNCIATION_DISPLAY)
  })

  it('falls back to the default on malformed JSON', () => {
    localStorage.setItem('teochew-dictionary:pronunciation-display', 'not json')
    expect(readPronunciationDisplay()).toEqual(DEFAULT_PRONUNCIATION_DISPLAY)
  })
})

describe('visiblePronunciationFields', () => {
  it('keeps sandhi when it differs from the citation form', () => {
    const reading = { pengim: 'dio5', sandhi: 'dio7' }
    expect(visiblePronunciationFields(reading, DEFAULT_PRONUNCIATION_DISPLAY)).toEqual([
      'pengim',
      'ipa',
      'poj',
      'sandhi',
    ])
  })

  it('drops sandhi when it equals the citation form', () => {
    const reading = { pengim: 'dio5', sandhi: 'dio5' }
    expect(visiblePronunciationFields(reading, DEFAULT_PRONUNCIATION_DISPLAY)).toEqual(['pengim', 'ipa', 'poj'])
  })

  it('preserves the caller-supplied order', () => {
    const reading = { pengim: 'dio5', sandhi: 'dio7' }
    expect(visiblePronunciationFields(reading, ['sandhi', 'ipa', 'pengim'])).toEqual(['sandhi', 'ipa', 'pengim'])
  })

  it('handles a single-field list', () => {
    const reading = { pengim: 'dio5', sandhi: 'dio5' }
    expect(visiblePronunciationFields(reading, ['sandhi'])).toEqual([])
    expect(visiblePronunciationFields(reading, ['ipa'])).toEqual(['ipa'])
  })
})
