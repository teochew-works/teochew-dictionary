import { useState } from 'react'
import { useDecksStore } from '../decks/useDecksStore'

export function AddEntryToDeck({ entryId }: { entryId: string }) {
  const store = useDecksStore()
  const [deckId, setDeckId] = useState('')
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  return <details className="entry-detail__add">
    <summary>Add to deck</summary>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (!deckId && !name.trim()) return
      const id = deckId || store.createDeck(name.trim(), [entryId])
      if (deckId) store.addCardToDeck(id, entryId)
      setDeckId(id)
      setSaved(id)
    }}>
      <label>Deck{' '}<select value={deckId} onChange={(event) => { setDeckId(event.target.value); setSaved(null) }}>
        <option value="">Create a new deck</option>
        {store.state.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
      </select></label>
      {!deckId && <label>New deck name{' '}<input value={name} onChange={event => setName(event.target.value)} required /></label>}
      <button type="submit" disabled={!deckId && !name.trim()}>Add word</button>
      {saved && <p role="status">Word saved. <a href="#flashcards" onClick={() => store.setInPlay([saved])}>Study this deck</a></p>}
    </form>
  </details>
}
