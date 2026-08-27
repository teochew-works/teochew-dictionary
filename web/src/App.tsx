import { useEffect, useState } from 'react'
import { useDictionary } from './hooks/useDictionary'
import { DictionaryView } from './views/DictionaryView'
import { FlashcardsView } from './views/FlashcardsView'
import { SoundsView } from './views/SoundsView'
import { SettingsView } from './views/SettingsView'
import './App.css'

type Tab = 'dictionary' | 'flashcards' | 'sounds' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'settings', label: 'Settings' },
]

function tabFromHash(hash: string): Tab {
  const id = hash.replace(/^#/, '')
  return TABS.some((t) => t.id === id) ? (id as Tab) : 'dictionary'
}

export function App() {
  const { data, loading, error } = useDictionary()
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash))

  // Real `#tab` links give Cmd/Ctrl+click and middle-click their native
  // "open in new tab" behavior for free (issue #156); this listener keeps
  // `tab` in sync for same-tab navigation (clicks, back/forward).
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="app">
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
            SoundsView) and Settings only touches localStorage — neither
            depends on dict.json, so neither is gated behind the dictionary's
            loading/error state below. */}
        {tab !== 'sounds' && tab !== 'settings' && loading && <p className="app__status">Loading dictionary…</p>}
        {tab !== 'sounds' && tab !== 'settings' && error && (
          <p className="app__status app__status--error">
            Couldn't load the dictionary ({error}). If you're running this locally, make sure you've run{' '}
            <code>npm run build</code> in the repo root first.
          </p>
        )}
        {data && tab === 'dictionary' && <DictionaryView entries={data.entries} />}
        {data && tab === 'flashcards' && <FlashcardsView entries={data.entries} />}
        {tab === 'sounds' && <SoundsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
