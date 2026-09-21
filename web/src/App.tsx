import { useEffect, useState } from 'react'
import { useDictionary } from './hooks/useDictionary'
import { DictionaryView } from './views/DictionaryView'
import { FlashcardsView, parseFlashcardsDrawer, formatFlashcardsDrawer, type FlashcardsDrawer } from './views/FlashcardsView'
import { SoundsView, parseSoundsRoute, formatSoundsRoute, type SoundsRoute } from './views/SoundsView'
import { ElicitationView } from './views/ElicitationView'
import { SettingsView } from './views/SettingsView'
import { DonateView } from './views/DonateView'
import { AboutView } from './views/AboutView'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import './App.css'

type Tab = 'dictionary' | 'flashcards' | 'sounds' | 'elicit' | 'settings' | 'donate' | 'about' | 'more'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'flashcards', label: 'Study' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'more', label: 'More' },
]
const SECONDARY_TABS: { id: Tab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'donate', label: 'Support / Donate' },
  { id: 'about', label: 'About' },
  ...(import.meta.env.DEV ? [{ id: 'elicit' as const, label: 'Elicit' }] : []),
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
  | { tab: 'elicit' | 'settings' | 'donate' | 'about' | 'more' }

function safeDecode(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

function routeFromHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const slash = raw.indexOf('/')
  const rawId = slash === -1 ? raw : raw.slice(0, slash)
  const id = rawId === 'study' ? 'flashcards' : rawId
  const tab = [...TABS, ...SECONDARY_TABS].some((t) => t.id === id) ? (id as Tab) : 'dictionary'
  const rest = slash === -1 ? '' : raw.slice(slash + 1)
  switch (tab) {
    case 'dictionary':
      return { tab, entryId: rest ? safeDecode(rest) : null }
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
  const activeTab = SECONDARY_TABS.some((item) => item.id === tab) ? 'more' : tab

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
        <h1 className="app__brand"><span className="app__brand-mark" aria-hidden="true">潮</span><span>Teochew Dictionary<small lang="zh-Hant">潮州話</small></span></h1>
        <nav className="app__tabs" aria-label="Primary">
          {TABS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} aria-current={activeTab === id ? 'page' : undefined} className={activeTab === id ? 'app__tab app__tab--active' : 'app__tab'}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app__main">
        {/* Sounds and Elicit share dist/sounds.json (via useSounds), and Settings,
            Donate and About only touch localStorage or are static — none of these
            depend on dict.json, so none are gated behind the dictionary's
            loading/error state below. */}
        {tab !== 'sounds' && tab !== 'elicit' && tab !== 'settings' && tab !== 'donate' && tab !== 'about' && tab !== 'more' && loading && (
          <p className="app__status">Loading dictionary…</p>
        )}
        {tab !== 'sounds' && tab !== 'elicit' && tab !== 'settings' && tab !== 'donate' && tab !== 'about' && tab !== 'more' && error && (
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
        {tab === 'elicit' && import.meta.env.DEV && <ElicitationView />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'donate' && <DonateView />}
        {tab === 'about' && <AboutView />}
        {tab === 'more' && (
          <section className="app__more" aria-labelledby="more-title">
            <h2 id="more-title">More</h2>
            <nav aria-label="Settings and information">
              {SECONDARY_TABS.map(({ id, label }) => <a key={id} href={`#${id}`}>{label}</a>)}
            </nav>
          </section>
        )}
      </main>
    </div>
  )
}
