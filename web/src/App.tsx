import { useEffect, useState } from 'react'
import { useDictionary } from './hooks/useDictionary'
import { DictionaryView } from './views/DictionaryView'
import { FlashcardsView } from './views/FlashcardsView'
import { SoundsView } from './views/SoundsView'
import { SettingsView } from './views/SettingsView'
import { DonateView } from './views/DonateView'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import './App.css'

type Tab = 'dictionary' | 'flashcards' | 'sounds' | 'settings' | 'donate'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'settings', label: 'Settings' },
  { id: 'donate', label: 'Donate' },
]

/**
 * The dictionary tab additionally carries an optional selected entry as
 * `#dictionary/<entry-id>` — routing that selection through the hash rather
 * than component state gets a phone's back gesture back to the list instead
 * of out of the app, and makes an entry a shareable deep link (also useful
 * on desktop). See DictionaryView's own `selectedId`/`onSelectEntry` props.
 */
function routeFromHash(hash: string): { tab: Tab; entryId: string | null } {
  const raw = hash.replace(/^#/, '')
  const slash = raw.indexOf('/')
  const id = slash === -1 ? raw : raw.slice(0, slash)
  const tab = TABS.some((t) => t.id === id) ? (id as Tab) : 'dictionary'
  const entryId = tab === 'dictionary' && slash !== -1 ? decodeURIComponent(raw.slice(slash + 1)) : null
  return { tab, entryId }
}

export function App() {
  const { data, loading, error } = useDictionary()
  const [{ tab, entryId }, setRoute] = useState(() => routeFromHash(window.location.hash))

  // Real `#tab` links give Cmd/Ctrl+click and middle-click their native
  // "open in new tab" behavior for free (issue #156); this listener keeps
  // the route in sync for same-tab navigation (clicks, back/forward, and a
  // selected dictionary entry changing the hash — see routeFromHash).
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const selectEntry = (id: string | null) => {
    window.location.hash = id ? `dictionary/${encodeURIComponent(id)}` : 'dictionary'
  }

  return (
    <div className="app">
      <UpdatePrompt />
      <header className="app__header">
        <h1>Teochew Dictionary</h1>
        <nav className="app__tabs">
          {TABS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className={tab === id ? 'app__tab app__tab--active' : 'app__tab'}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app__main">
        {/* Sounds has its own data source (dist/sounds.json via useSounds inside
            SoundsView), and Settings and Donate only touch localStorage or are
            static — none of the three depend on dict.json, so none are gated
            behind the dictionary's loading/error state below. */}
        {tab !== 'sounds' && tab !== 'settings' && tab !== 'donate' && loading && (
          <p className="app__status">Loading dictionary…</p>
        )}
        {tab !== 'sounds' && tab !== 'settings' && tab !== 'donate' && error && (
          <p className="app__status app__status--error">
            Couldn't load the dictionary ({error}). If you're running this locally, make sure you've run{' '}
            <code>npm run build</code> in the repo root first.
          </p>
        )}
        {data && tab === 'dictionary' && (
          <DictionaryView entries={data.entries} selectedId={entryId} onSelectEntry={selectEntry} />
        )}
        {data && tab === 'flashcards' && <FlashcardsView entries={data.entries} />}
        {tab === 'sounds' && <SoundsView />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'donate' && <DonateView />}
      </main>
    </div>
  )
}
