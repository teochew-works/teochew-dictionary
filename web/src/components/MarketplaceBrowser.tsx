import type { PointerEvent as ReactPointerEvent } from 'react'
import type { StarterDeckCatalogEntry } from '../types/starter-decks'

/**
 * The starter-deck marketplace as a drawer body (see Drawer.tsx): browse the
 * 20 curated catalog decks (issue #199) and install one, which copies it into
 * a new editable `kind: 'user'` deck — never added to the rail automatically.
 *
 * Each row is both a drag source (drag it onto the library, mirroring
 * DictionaryBrowser's entries) and a one-tap install — a click only fires if
 * the pointer never crossed the drag threshold, so the two never conflict.
 * The tap path is what makes this work without a drag on any device: a
 * touch drag still works too, via useDeckDrag's long-press-to-lift.
 */
export function MarketplaceBrowser({
  decks,
  loading,
  error,
  deckDrag,
  onInstall,
}: {
  decks: StarterDeckCatalogEntry[]
  loading: boolean
  error: string | null
  deckDrag: { onPointerDown: (deckId: string) => (e: ReactPointerEvent) => void; isDragging: (deckId: string) => boolean }
  onInstall: (deck: StarterDeckCatalogEntry) => void
}) {
  return (
    <>
      <div className="drawer__head">
        <span className="eyebrow">Marketplace</span>
        <span className="drawer__hint">Drag a starter deck onto your library, or tap it to install — it becomes a normal, editable deck</span>
      </div>

      <div className="drawer__list">
        {loading && <p className="drawer__note">Loading starter decks…</p>}
        {error && <p className="drawer__note">Couldn't load the marketplace catalog ({error}).</p>}
        {!loading &&
          !error &&
          decks.map((deck) => (
            <div
              key={deck.id}
              className={deckDrag.isDragging(deck.id) ? 'entry is-source' : 'entry'}
              data-drag-source=""
              role="button"
              tabIndex={0}
              aria-label={`${deck.name}, ${deck.cards.length} words`}
              onPointerDown={deckDrag.onPointerDown(deck.id)}
              onClick={() => onInstall(deck)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onInstall(deck)
                }
              }}
            >
              <span className="entry__hw">{deck.name}</span>
              <span className="entry__rest">
                <span className="entry__g">{deck.cards.length} words</span>
              </span>
            </div>
          ))}
      </div>
    </>
  )
}
