import { memo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { EntryDeckMenu } from './EntryDeckMenu'
import { copyModifierName } from '../decks/dnd/copyModifier'
import type { EnrichedEntry } from '../types/dict'
import type { PronunciationMode } from '../settings/pronunciationMode'
import type { Deck } from '../decks/types'

export interface DeckContentsCardDrag {
  onPointerDown: (entryId: string) => (e: ReactPointerEvent) => void
  isDragging: (entryId: string) => boolean
}

/**
 * What a deck actually holds, as a drawer body (see Drawer.tsx). Until this
 * existed a deck was a number: you could put cards in and never see them, and
 * never take one back out.
 *
 * Rows are drag sources that carry which deck they came from, which is what
 * turns a drag onto another deck into a move rather than a copy — see
 * decks/dnd/resolveDrop.ts.
 */
export function DeckContents({
  deck,
  entryById,
  pronunciation,
  cardDrag,
  userDecks,
  onAddCard,
  onRemoveCard,
  onNewDeckFromCard,
  onBrowseDictionary,
}: {
  deck: Deck
  entryById: Map<string, EnrichedEntry>
  pronunciation: PronunciationMode
  cardDrag: DeckContentsCardDrag
  /** Every user deck, for the per-row membership menu. */
  userDecks: Deck[]
  onAddCard: (deckId: string, entryId: string) => void
  onRemoveCard: (deckId: string, entryId: string) => void
  onNewDeckFromCard: (entryId: string) => void
  onBrowseDictionary: () => void
}) {
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  return (
    <>
      <div className="drawer__head">
        <span className="eyebrow">Deck</span>
        <span className="drawer__deck">
          <i className="drawer__swatch" style={{ background: `var(--deck-hue-${deck.hue}-bg)` }} aria-hidden="true" />
          <b>{deck.name}</b>
          <span className="mono drawer__count">
            {deck.cards.length.toLocaleString()} {deck.cards.length === 1 ? 'card' : 'cards'}
          </span>
        </span>
        <span className="drawer__hint">
          Drag a card onto another deck to move it · hold {copyModifierName()} to copy
        </span>
        <div className="bar__spacer" />
        <button type="button" className="pill" onClick={onBrowseDictionary}>
          ＋ Add cards
        </button>
      </div>

      <div className="drawer__list">
        {deck.cards.length === 0 && (
          <p className="drawer__note">
            This deck is empty. Add cards from the dictionary, or file the card you are reviewing.
          </p>
        )}

        {deck.cards.map((entryId) => (
          <div className="entry-wrap" key={entryId}>
            <DeckContentsRow
              entryId={entryId}
              entry={entryById.get(entryId)}
              deckName={deck.name}
              pronunciation={pronunciation}
              dragging={cardDrag.isDragging(entryId)}
              onPointerDown={cardDrag.onPointerDown(entryId)}
              onOpenMenu={() => setMenuEntryId(entryId)}
              onRemove={() => onRemoveCard(deck.id, entryId)}
            />
            {menuEntryId === entryId && (
              <EntryDeckMenu
                headword={entryById.get(entryId)?.headword ?? entryId}
                entryId={entryId}
                userDecks={userDecks}
                onAddCard={(toDeckId) => onAddCard(toDeckId, entryId)}
                onRemoveCard={(fromDeckId) => onRemoveCard(fromDeckId, entryId)}
                onNewDeck={() => onNewDeckFromCard(entryId)}
                onClose={() => setMenuEntryId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Memoised because a drag re-renders this screen several times (the caret
 * moving, the badge changing) and a deck can hold hundreds of rows — a plain
 * map would re-render all of them during the very gesture these rows exist
 * for.
 */
const DeckContentsRow = memo(function DeckContentsRow({
  entryId,
  entry,
  deckName,
  pronunciation,
  dragging,
  onPointerDown,
  onOpenMenu,
  onRemove,
}: {
  entryId: string
  /** Absent when the id no longer resolves — see the unresolved branch below. */
  entry: EnrichedEntry | undefined
  deckName: string
  pronunciation: PronunciationMode
  dragging: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onOpenMenu: () => void
  onRemove: () => void
}) {
  const classes = ['entry', 'entry--in-deck']
  if (dragging) classes.push('is-source')

  /*
   * A card id that no longer resolves against the loaded dictionary — stale
   * after a lexicon rebuild, which decks/pipeline.ts silently skips. Skipping
   * it here too would make it invisible *and* unremovable, so it gets a muted
   * row whose only affordance is getting rid of it.
   */
  if (!entry) {
    return (
      <div className="entry entry--unresolved">
        <span className="entry__hw">?</span>
        <span className="entry__rest">
          <span className="entry__g">No longer in the dictionary</span>
          <span className="entry__tags">
            <span className="tag mono">{entryId}</span>
          </span>
        </span>
        <RemoveButton label={`Remove this missing card from ${deckName}`} onRemove={onRemove} />
      </div>
    )
  }

  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')

  return (
    <div
      className={classes.join(' ')}
      data-drag-source=""
      role="button"
      tabIndex={0}
      aria-label={`${entry.headword}${gloss ? `, ${gloss}` : ''}, in ${deckName}`}
      onPointerDown={onPointerDown}
      onClick={onOpenMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenMenu()
        }
      }}
    >
      <span className="entry__hw">{entry.headword}</span>
      {reading && <span className="entry__p mono">{pronunciation === 'sandhi' ? reading.sandhi : reading.pengim}</span>}
      <span className="entry__rest">{gloss && <span className="entry__g">{gloss}</span>}</span>
      <RemoveButton label={`Remove ${entry.headword} from ${deckName}`} onRemove={onRemove} />
    </div>
  )
})

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="entry__remove"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
        <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  )
}
