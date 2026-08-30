import type { StarterDeckCatalogEntry } from '../types/starter-decks'

/**
 * The starter-deck marketplace as a drawer body (see Drawer.tsx): browse the
 * 20 curated catalog decks (issue #199) and install one, which copies it into
 * a new editable `kind: 'user'` deck — never added to the rail automatically.
 */
export function MarketplaceBrowser({
  decks,
  loading,
  error,
  onInstall,
}: {
  decks: StarterDeckCatalogEntry[]
  loading: boolean
  error: string | null
  onInstall: (deck: StarterDeckCatalogEntry) => void
}) {
  return (
    <>
      <div className="drawer__head">
        <span className="eyebrow">Marketplace</span>
        <span className="drawer__hint">Install a starter deck — it becomes a normal, editable deck in your library</span>
      </div>

      <div className="drawer__list">
        {loading && <p className="drawer__note">Loading starter decks…</p>}
        {error && <p className="drawer__note">Couldn't load the marketplace catalog ({error}).</p>}
        {!loading &&
          !error &&
          decks.map((deck) => (
            <div key={deck.id} className="entry-wrap">
              <div className="entry" aria-label={`${deck.name}, ${deck.cards.length} words`}>
                <span className="entry__hw">{deck.name}</span>
                <span className="entry__rest">
                  <span className="entry__g">{deck.cards.length} words</span>
                </span>
              </div>
              <button type="button" className="pill" onClick={() => onInstall(deck)}>
                Install
              </button>
            </div>
          ))}
      </div>
    </>
  )
}
