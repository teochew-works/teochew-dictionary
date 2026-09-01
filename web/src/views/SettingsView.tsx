import { useRef, useState } from 'react'
import { readShowLicence, writeShowLicence } from '../settings/showLicence'
import { readAudioOnly, writeAudioOnly } from '../settings/audioOnly'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readPronunciationMode, writePronunciationMode, type PronunciationMode } from '@teochew/core'
import { readMogherLinks, writeMogherLinks } from '../settings/mogherLinks'
import { buildBackup, restoreBackup } from '../backup/backup'
import { InstallPrompt } from '../pwa/InstallPrompt'
import { OfflineDataToggle } from '../pwa/OfflineDataToggle'
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
  const [backupStatus, setBackupStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function exportBackup() {
    const backup = await buildBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teochew-dictionary-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function requestImport() {
    importInputRef.current?.click()
  }

  async function handleImportFile(file: File) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setBackupStatus({ kind: 'error', message: "That file isn't valid JSON." })
      return
    }
    if (
      !window.confirm(
        'Importing a backup replaces your current decks and review history — this cannot be undone. Continue?',
      )
    ) {
      return
    }
    const result = await restoreBackup(parsed)
    setBackupStatus(
      result.ok
        ? { kind: 'ok', message: `Restored ${result.deckCount} deck${result.deckCount === 1 ? '' : 's'} and ${result.cardCount.toLocaleString()} reviewed card${result.cardCount === 1 ? '' : 's'}. Reopen the Flashcards tab to see them.` }
        : { kind: 'error', message: result.error },
    )
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

      <fieldset className="settings-view__group">
        <legend>Install</legend>
        <p className="settings-view__hint">
          Installing keeps your review history: Safari and Chrome both clear a site's storage after a
          period of inactivity, and an installed app is exempt.
        </p>
        <InstallPrompt />
      </fieldset>

      <fieldset className="settings-view__group">
        <legend>Offline access</legend>
        <p className="settings-view__hint">
          The app shell works offline once installed, but the dictionary itself is large enough that it
          isn't downloaded until you ask for it here.
        </p>
        <OfflineDataToggle />
      </fieldset>

      <fieldset className="settings-view__group">
        <legend>Data</legend>
        <p className="settings-view__hint">
          Decks and review history live only in this browser, and can be lost — a device change, clearing
          site data, or (on iOS) just not opening the app for a week. Export a backup to keep somewhere
          safe, or move it to another browser or device.
        </p>
        <div className="settings-view__backup-actions">
          <button type="button" className="settings-view__button" onClick={() => void exportBackup()}>
            Export backup
          </button>
          <button type="button" className="settings-view__button" onClick={requestImport}>
            Import backup…
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            aria-label="Import backup file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleImportFile(file)
            }}
          />
        </div>
        {backupStatus && (
          <p
            className={
              backupStatus.kind === 'error'
                ? 'settings-view__backup-status settings-view__backup-status--error'
                : 'settings-view__backup-status'
            }
            role="status"
          >
            {backupStatus.message}
          </p>
        )}
      </fieldset>
    </div>
  )
}
