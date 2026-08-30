import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { hasFullAudio } from '../search/filters'
import { EntryDeckMenu } from './EntryDeckMenu'
import type { EnrichedEntry } from '../types/dict'
import type { PronunciationMode } from '../settings/pronunciationMode'
import type { Deck } from '../decks/types'

const MAX_RESULTS = 60

function hasAnyAudio(entry: EnrichedEntry): boolean {
  const r = entry.readings[0]
  return r !== undefined && (r.wordAudio !== null || r.audio.some((c) => c !== null))
}

/**
 * The dictionary as a drawer body (see Drawer.tsx): search it, then drag an
 * entry onto one of your decks — or click it for the same thing without a
 * drag. Docked rather than modal because filing cards is something you do
 * *while* reviewing, and a modal would hide the decks you are filing into.
 *
 * Requires a query before listing anything: with 16,000+ entries, showing
 * the whole dictionary here (as the Dictionary tab does) would turn "add a
 * few cards" into a scroll-fest.
 */
export function DictionaryBrowser({
  entries,
  userDecks,
  pronunciation,
  poolSize,
  cardDrag,
  onAddCard,
  onRemoveCard,
  onNewDeckFromCard,
  onSavePoolAsDeck,
}: {
  entries: EnrichedEntry[]
  userDecks: Deck[]
  pronunciation: PronunciationMode
  /** Cards currently surviving the filters — what "Save this pool as a deck" would capture. */
  poolSize: number
  cardDrag: { onPointerDown: (entryId: string) => (e: ReactPointerEvent) => void; isDragging: (entryId: string) => boolean }
  onAddCard: (deckId: string, entryId: string) => void
  onRemoveCard: (deckId: string, entryId: string) => void
  onNewDeckFromCard: (entryId: string) => void
  onSavePoolAsDeck: () => void
}) {
  const [query, setQuery] = useState('')
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)
  /** The row the open menu belongs to — the panel is portalled, so it positions from this. */
  const menuAnchorRef = useRef<HTMLElement | null>(null)
  const index = useMemo(() => createSearchIndex(entries), [entries])
  const results = useMemo(() => (query.trim() ? search(index, query).slice(0, MAX_RESULTS) : []), [index, query])

  return (
    <>
      <div className="drawer__head">
        <span className="eyebrow">Dictionary</span>
        <input
          type="search"
          className="drawer__search"
          aria-label="Search the dictionary"
          placeholder="Search headword, Peng'im, or English…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="drawer__hint">Drag an entry onto one of your decks</span>
        <div className="bar__spacer" />
        <button type="button" className="pill" disabled={poolSize === 0} onClick={onSavePoolAsDeck}>
          Save this pool as a deck
        </button>
      </div>

      <div className="drawer__list">
        {userDecks.length === 0 && <p className="drawer__note">Create a deck first, or drop an entry on the library to start one.</p>}
        {query.trim() === '' ? (
          <p className="drawer__note">Type to search for entries to add.</p>
        ) : results.length === 0 ? (
          <p className="drawer__note">No entries match “{query.trim()}”.</p>
        ) : (
          results.map((entry) => {
            const reading = entry.readings[0]
            const gloss = entry.senses[0]?.gloss_en.join(', ')
            return (
              <div key={entry.id} className="entry-wrap">
                <div
                  className={cardDrag.isDragging(entry.id) ? 'entry is-source' : 'entry'}
                  data-drag-source=""
                  role="button"
                  tabIndex={0}
                  aria-label={`${entry.headword}${reading ? `, ${reading.pengim}` : ''}${gloss ? `, ${gloss}` : ''}`}
                  onPointerDown={cardDrag.onPointerDown(entry.id)}
                  onClick={(e) => {
                    menuAnchorRef.current = e.currentTarget
                    setMenuEntryId(entry.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      menuAnchorRef.current = e.currentTarget
                      setMenuEntryId(entry.id)
                    }
                  }}
                >
                  <span className="entry__hw">{entry.headword}</span>
                  {reading && (
                    <span className="entry__p mono">{pronunciation === 'sandhi' ? reading.sandhi : reading.pengim}</span>
                  )}
                  <span className="entry__rest">
                    {gloss && <span className="entry__g">{gloss}</span>}
                    <span className="entry__tags">
                      {entry.level && <span className="tag">{entry.level}</span>}
                      {hasAnyAudio(entry) && (
                        <span className={hasFullAudio(entry) ? 'tag tag--full' : 'tag tag--part'}>
                          {hasFullAudio(entry) ? 'audio' : 'partial'}
                        </span>
                      )}
                    </span>
                  </span>
                </div>

                {menuEntryId === entry.id && (
                  <EntryDeckMenu
                    headword={entry.headword}
                    entryId={entry.id}
                    userDecks={userDecks}
                    anchorRef={menuAnchorRef}
                    onAddCard={(deckId) => onAddCard(deckId, entry.id)}
                    onRemoveCard={(deckId) => onRemoveCard(deckId, entry.id)}
                    onNewDeck={() => onNewDeckFromCard(entry.id)}
                    onClose={() => setMenuEntryId(null)}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
