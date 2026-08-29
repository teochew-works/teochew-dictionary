import { useEffect, useMemo, useRef, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import type { EnrichedEntry } from '../types/dict'
import type { Deck } from '../decks/types'

const MAX_RESULTS = 30

/**
 * Adds/removes cards to/from user decks by searching the dictionary (issue
 * #187 stage 4) — the other half of "add and remove cards" alongside
 * CardFileControls, which only ever acts on the one card currently showing.
 * Reuses search/searchIndex.ts (the same Fuse.js wrapper as the Dictionary
 * tab) rather than re-deriving matching logic. Requires a query before
 * showing any rows: with 16,000+ entries, dumping the whole dictionary here
 * (as the Dictionary tab does) would make "add a few cards" a scroll-fest.
 */
export function BrowseDrawer({
  entries,
  userDecks,
  onAddCard,
  onRemoveCard,
  onClose,
}: {
  entries: EnrichedEntry[]
  userDecks: Deck[]
  onAddCard: (deckId: string, entryId: string) => void
  onRemoveCard: (deckId: string, entryId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const index = useMemo(() => createSearchIndex(entries), [entries])
  const results = useMemo(() => (query.trim() ? search(index, query).slice(0, MAX_RESULTS) : []), [index, query])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="browse-drawer" role="dialog" aria-label="Browse dictionary" ref={panelRef}>
      <div className="browse-drawer__header">
        <h3>Add cards to a deck</h3>
        <button type="button" className="browse-drawer__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <input
        type="search"
        className="browse-drawer__search"
        aria-label="Search the dictionary"
        placeholder="Type to search…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />

      {userDecks.length === 0 ? (
        <p className="browse-drawer__hint">Create a deck first, then come back here to add cards to it.</p>
      ) : query.trim() === '' ? (
        <p className="browse-drawer__hint">Type to search for entries to add.</p>
      ) : results.length === 0 ? (
        <p className="browse-drawer__hint">No matches.</p>
      ) : (
        <ul className="browse-drawer__results">
          {results.map((entry) => (
            <BrowseDrawerRow key={entry.id} entry={entry} userDecks={userDecks} onAddCard={onAddCard} onRemoveCard={onRemoveCard} />
          ))}
        </ul>
      )}
    </div>
  )
}

function BrowseDrawerRow({
  entry,
  userDecks,
  onAddCard,
  onRemoveCard,
}: {
  entry: EnrichedEntry
  userDecks: Deck[]
  onAddCard: (deckId: string, entryId: string) => void
  onRemoveCard: (deckId: string, entryId: string) => void
}) {
  const memberOf = userDecks.filter((d) => d.cards.includes(entry.id))
  const notMemberOf = userDecks.filter((d) => !d.cards.includes(entry.id))
  const gloss = entry.senses[0]?.gloss_en.join(', ')

  return (
    <li className="browse-drawer__row">
      <div className="browse-drawer__entry">
        <span className="browse-drawer__headword">{entry.headword}</span>
        {gloss && <span className="browse-drawer__gloss">{gloss}</span>}
      </div>

      {memberOf.length > 0 && (
        <ul className="browse-drawer__memberships">
          {memberOf.map((deck) => (
            <li key={deck.id} className={`deck-chip deck-chip--${deck.hue} deck-chip--compact`}>
              {deck.name}
              <button
                type="button"
                className="deck-chip__remove"
                aria-label={`Remove ${entry.headword} from ${deck.name}`}
                onClick={() => onRemoveCard(deck.id, entry.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {notMemberOf.length > 0 && (
        <select
          className="browse-drawer__add"
          aria-label={`Add ${entry.headword} to a deck`}
          value=""
          onChange={(e) => {
            if (e.target.value) onAddCard(e.target.value, entry.id)
          }}
        >
          <option value="" disabled>
            Add to deck…
          </option>
          {notMemberOf.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      )}
    </li>
  )
}
