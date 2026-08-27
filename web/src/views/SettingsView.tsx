import { useState } from 'react'
import { readShowLicence, writeShowLicence } from '../settings/showLicence'
import { readAudioOnly, writeAudioOnly } from '../settings/audioOnly'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { readMogherLinks, writeMogherLinks } from '../settings/mogherLinks'
import './SettingsView.css'

/**
 * Consolidates the display preferences that used to be scattered as one-off,
 * inconsistently persisted per-view toggles (issue #173). Each toggle here
 * reads/writes the same `settings/*` modules the Dictionary and Flashcards
 * tabs use for their own convenience copies of these controls — so this tab
 * isn't the only place to change them, just the discoverable one.
 */
export function SettingsView() {
  const [showLicence, setShowLicence] = useState(readShowLicence)
  const [audioOnly, setAudioOnly] = useState(readAudioOnly)
  const [fullAudioOnly, setFullAudioOnly] = useState(readFullAudioOnly)
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [mogherLinks, setMogherLinks] = useState(readMogherLinks)

  function toggleShowLicence(value: boolean) {
    setShowLicence(value)
    writeShowLicence(value)
  }

  function toggleAudioOnly(value: boolean) {
    setAudioOnly(value)
    writeAudioOnly(value)
  }

  function toggleFullAudioOnly(value: boolean) {
    setFullAudioOnly(value)
    writeFullAudioOnly(value)
  }

  function togglePronunciation(checked: boolean) {
    const next: PronunciationMode = checked ? 'sandhi' : 'citation'
    setPronunciation(next)
    writePronunciationMode(next)
  }

  function toggleMogherLinks(value: boolean) {
    setMogherLinks(value)
    writeMogherLinks(value)
  }

  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <p className="settings-view__hint">
        These apply across the Dictionary and Flashcards tabs. Each tab also keeps its own copy of the
        settings relevant to it, so you don't have to come back here for quick changes.
      </p>

      <fieldset className="settings-view__group">
        <legend>Display</legend>
        <label className="settings-view__toggle">
          <input
            type="checkbox"
            checked={showLicence}
            onChange={(e) => toggleShowLicence(e.target.checked)}
          />
          Show licensing info
        </label>
        <label className="settings-view__toggle">
          <input type="checkbox" checked={audioOnly} onChange={(e) => toggleAudioOnly(e.target.checked)} />
          Only entries with audio
        </label>
        <label className="settings-view__toggle">
          <input
            type="checkbox"
            checked={fullAudioOnly}
            onChange={(e) => toggleFullAudioOnly(e.target.checked)}
          />
          Only fully recorded audio
        </label>
      </fieldset>

      <fieldset className="settings-view__group">
        <legend>Pronunciation</legend>
        <label className="settings-view__toggle">
          <input
            type="checkbox"
            checked={pronunciation === 'sandhi'}
            onChange={(e) => togglePronunciation(e.target.checked)}
          />
          Use sandhi pronunciation
        </label>
      </fieldset>

      <fieldset className="settings-view__group">
        <legend>External links</legend>
        <label className="settings-view__toggle">
          <input
            type="checkbox"
            checked={mogherLinks}
            onChange={(e) => toggleMogherLinks(e.target.checked)}
          />
          Link to mogher.com
        </label>
      </fieldset>
    </div>
  )
}
