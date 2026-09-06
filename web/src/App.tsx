import { useEffect, useState } from 'react'
import { useDictionary } from './hooks/useDictionary'
import { DictionaryView } from './views/DictionaryView'
import { FlashcardsView, parseFlashcardsDrawer, formatFlashcardsDrawer, type FlashcardsDrawer } from './views/FlashcardsView'
import { SoundsView, parseSoundsRoute, formatSoundsRoute, type SoundsRoute } from './views/SoundsView'
import { SettingsView } from './views/SettingsView'
import { DonateView } from './views/DonateView'
import { AboutView } from './views/AboutView'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import './App.css'

type Tab = 'dictionary' | 'flashcards' | 'sounds' | 'settings' | 'donate' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'settings', label: 'Settings' },
  { id: 'donate', label: 'Donate' },
  { id: 'about', label: 'About' },
]

/**
 * The dictionary tab additionally carries an optional selected entry as
 * `#dictionary/<entry-id>`, the sounds tab its sort mode and (in chart mode)
 * selected cell, and the flashcards tab its drawer — routing this state
 * through the hash rather than component state gets a phone's back gesture
 * back to the previous view instead of out of the app, and makes each a
 * shareable deep link (also useful on desktop). See each view's own
 * controlled props (`selectedId`/`onSelectEntry`, `route`/`onRouteChange`,
 * `drawer`/`onDrawerChange`).
 */
type Route =
  | { tab: 'dictionary'; entryId: string | null }
  | { tab: 'sounds'; soundsRoute: SoundsRoute }
  | { tab: 'flashcards'; flashcardsDrawer: FlashcardsDrawer }
  | { tab: 'settings' | 'donate' | 'about' }

function routeFromHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const slash = raw.indexOf('/')
  const id = slash === -1 ? raw : raw.slice(0, slash)
  const tab = TABS.some((t) => t.id === id) ? (id as Tab) : 'dictionary'
  const rest = slash === -1 ? '' : raw.slice(slash + 1)
  switch (tab) {
    case 'dictionary':
      return { tab, entryId: rest ? decodeURIComponent(rest) : null }
    case 'sounds':
      return { tab, soundsRoute: parseSoundsRoute(rest) }
    case 'flashcards':
      return { tab, flashcardsDrawer: parseFlashcardsDrawer(rest) }
    default:
      return { tab }
  }
}

export function App() {
  const { data, loading, error } = useDictionary()
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const tab = route.tab

  // Real `#tab` links give Cmd/Ctrl+click and middle-click their native
  // "open in new tab" behavior for free (issue #156); this listener keeps
  // the route in sync for same-tab navigation (clicks, back/forward, and
  // sub-state changes that write to the hash — see routeFromHash).
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const selectEntry = (id: string | null) => {
    window.location.hash = id ? `dictionary/${encodeURIComponent(id)}` : 'dictionary'
  }
  const setSoundsRoute = (soundsRoute: SoundsRoute) => {
    window.location.hash = formatSoundsRoute(soundsRoute)
  }
  const setFlashcardsDrawer = (flashcardsDrawer: FlashcardsDrawer) => {
    window.location.hash = formatFlashcardsDrawer(flashcardsDrawer)
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
            SoundsView), and Settings, Donate and About only touch localStorage or are
            static — none of the four depend on dict.json, so none are gated
            behind the dictionary's loading/error state below. */}
        {tab !== 'sounds' && tab !== 'settings' && tab !== 'donate' && tab !== 'about' && loading && (
          <p className="app__status">Loading dictionary…</p>
        )}
        {tab !== 'sounds' && tab !== 'settings' && tab !== 'donate' && tab !== 'about' && error && (
          <p className="app__status app__status--error">
            Couldn't load the dictionary ({error}). If you're running this locally, make sure you've run{' '}
            <code>npm run build</code> in the repo root first.
          </p>
        )}
        {data && route.tab === 'dictionary' && (
          <DictionaryView entries={data.entries} selectedId={route.entryId} onSelectEntry={selectEntry} />
        )}
        {data && route.tab === 'flashcards' && (
          <FlashcardsView entries={data.entries} drawer={route.flashcardsDrawer} onDrawerChange={setFlashcardsDrawer} />
        )}
        {route.tab === 'sounds' && <SoundsView route={route.soundsRoute} onRouteChange={setSoundsRoute} />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'donate' && <DonateView />}
        {tab === 'about' && <AboutView />}
      </main>
    </div>
  )
}
