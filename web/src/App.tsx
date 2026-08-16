import { useState } from 'react'
import { useDictionary } from './hooks/useDictionary'
import { DictionaryView } from './views/DictionaryView'
import { FlashcardsView } from './views/FlashcardsView'
import './App.css'

type Tab = 'dictionary' | 'flashcards'

export function App() {
  const { data, loading, error } = useDictionary()
  const [tab, setTab] = useState<Tab>('dictionary')

  return (
    <div className="app">
      <header className="app__header">
        <h1>Teochew Dictionary</h1>
        <nav className="app__tabs">
          <button
            type="button"
            className={tab === 'dictionary' ? 'app__tab app__tab--active' : 'app__tab'}
            onClick={() => setTab('dictionary')}
          >
            Dictionary
          </button>
          <button
            type="button"
            className={tab === 'flashcards' ? 'app__tab app__tab--active' : 'app__tab'}
            onClick={() => setTab('flashcards')}
          >
            Flashcards
          </button>
        </nav>
      </header>

      <main className="app__main">
        {loading && <p className="app__status">Loading dictionary…</p>}
        {error && (
          <p className="app__status app__status--error">
            Couldn't load the dictionary ({error}). If you're running this locally, make sure you've run{' '}
            <code>npm run build</code> in the repo root first.
          </p>
        )}
        {data && tab === 'dictionary' && <DictionaryView entries={data.entries} />}
        {data && tab === 'flashcards' && <FlashcardsView entries={data.entries} />}
      </main>
    </div>
  )
}
