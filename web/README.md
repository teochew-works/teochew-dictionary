# Teochew Dictionary — Web UI

A static, backend-free web app for the [Teochew Dictionary](../README.md):
a searchable dictionary browser, a flashcard/SRS trainer, and a browsable
sound inventory, built on top of the root project's `dist/dict.json` and
`dist/sounds.json`.

This is its own npm project — independent `package.json`, buildable without
touching the root CLI tooling's build/test pipeline. Why it is static and
backend-free, and why it is a separate project, is recorded as
[ADR-0019](../docs/adrs/adr-0019.md).

---

## Prerequisites

- Node `^20.19.0 || >=22.12.0`
- The root project's data must be built first: from the **repo root**, run

  ```bash
  npm install
  npm run build     # → dist/dict.json, dist/sounds.json
  ```

  `web/`'s `predev`/`prebuild` scripts copy `dist/dict.json` and
  `dist/sounds.json` into `web/public/data/` automatically, but they only
  *copy* — they don't *build* them. If either doesn't exist yet, they fail
  with:

  ```
  no dictionary at <repo>/dist/dict.json — run `npm run build` in the repo root first
  ```

  Re-run `npm run build` at the repo root whenever `data/` changes, then
  restart `npm run dev` (or re-run `npm run build` here) to pick it up.

## Development

```bash
npm install
npm run dev
```

Opens a dev server, by default at `http://localhost:5173/`.

## Build

```bash
npm run build
```

Produces `web/dist/` — a static bundle deployable to any static host, no
server required.

## Preview a production build

```bash
npm run preview
```

## Tests

```bash
npm run test
```

Covers the SM-2 scheduler's scheduling math (`src/srs/scheduler.test.ts`),
the Fuse.js search wrapper (`src/search/searchIndex.test.ts`), and a couple
of component smoke tests. IndexedDB persistence itself isn't exercised by
this suite (`jsdom` doesn't implement IndexedDB) — verify that manually by
grading a few flashcards, reloading the page, and confirming they don't
reappear as new (DevTools → Application → IndexedDB →
`teochew-flashcards` → `cards`).

## Architecture

The decisions behind this section are recorded in [`docs/adrs/`](../docs/adrs/README.md):
[ADR-0019](../docs/adrs/adr-0019.md) (static, backend-free, its own npm project, data fetched at
runtime), [ADR-0020](../docs/adrs/adr-0020.md) (the hand-rolled SM-2 scheduler and where state
lives), [ADR-0021](../docs/adrs/adr-0021.md) (one drag engine, keyboard parity, undo instead of
confirmation) and [ADR-0015](../docs/adrs/adr-0015.md) (why clip licences are credited separately
from the entry's).

- Vite + React + TypeScript, no router — Dictionary, Flashcards, and Sounds
  are in-app views, not separate routes; the dictionary's entry detail is a
  master-detail pane within its own view.
- Search: [Fuse.js](https://www.fusejs.io/) over each entry's precomputed
  `search_keys` (headword, Peng'im with/without tones, POJ with/without
  diacritics, English glosses — see `src/build/enrich.ts` at the repo root).
- Flashcards ([ADR-0020](../docs/adrs/adr-0020.md)): a hand-rolled SM-2-style
  scheduler (`src/srs/scheduler.ts`, no dependency) with a 3-button grading UI (Again/Good/Easy), persisted via
  [`idb`](https://github.com/jakearchibald/idb) (IndexedDB `teochew-flashcards`
  database, `cards` object store keyed by entry id).
- The dictionary list is capped, not virtualised (`PAGE_SIZE` in
  `DictionaryView.tsx`). Rendering all 16,000+ entries put 84,000 nodes in the
  DOM at rest and made each keystroke rebuild them — up to 600ms of blocked
  main thread, measured. The first 200 render with a "show more" control, and
  the query itself is passed through `useDeferredValue` so a keystroke never
  waits on the search (30-100ms, scaling with the number of words Fuse has to
  tokenise) before painting.
- Decks and the table (issues #187/#189): decks live in a library rail and are
  dragged onto "the table" to enter a session. Everything on the table is
  unioned into one review queue (`src/decks/pipeline.ts`), and the session's
  filters apply to that whole pool rather than to any one deck — which is why
  the session bar carries a funnel readout naming what each stage removed.
  Deck membership, the table, and saved groups persist to localStorage under
  `teochew-dictionary:decks/v1`; review scheduling stays in IndexedDB.
- The drawn card has continuity (`src/srs/useSrsQueue.ts`). A review queue is
  kept per table — the set of decks in play, order-insensitive — so putting a
  deck on the table and taking it off again returns you to the card the first
  table was showing, with its own progress. Within a table the queue only
  changes when something in it becomes ineligible: it is pruned of cards that
  left the pool, and topped up only when the pool actually grows. Renaming a
  deck, filing a card, reordering the library, or changing a filter the card
  still passes all leave it alone. (Rebuilding on every pool change instead
  reshuffles, so an unrelated deck rename used to deal a different card.)
  Sessions live for the page load; the scheduling state behind them persists.
- A deck's cards are editable, not just countable. "View cards" in a deck's
  options menu opens its contents in the bottom dock (`DeckContents.tsx`),
  sharing one `Drawer` shell with the dictionary browser so switching between
  them doesn't restart the dock's open transition. Rows there are drag sources
  that carry which deck they came from, which is what makes a drop on another
  deck a *move*; holding the platform's copy modifier (Option on macOS, Control
  elsewhere — `decks/dnd/copyModifier.ts`) makes it a copy instead, and the
  badge flips while the key is held. The trash arms for those drags too.
  The list is itself a drop zone that can say *where* in the deck a card would
  land, so dragging a row within it reorders the deck and dragging a card into
  it files at a position; space lifts a row for the keyboard equivalent while
  Enter opens its decks. `EntryDeckMenu` is the pointer- and keyboard-native
  equivalent for membership: it lists every
  deck as a checkbox, so ticking files, unticking removes, and ticking a second
  deck without unticking the first is the copy a modifier-less path could not
  otherwise express.
- One drag engine, not four ([ADR-0021](../docs/adrs/adr-0021.md),
  `src/decks/dnd/useDeckDrag.ts`): a deck out of the
  library, a chip around the table, the showing card into a deck, and an entry
  out of the browse drawer all resolve against the same set of zones on every
  pointer move (`resolveDrop.ts`, pure and rect-based). That single resolution
  is what lets the drag image carry a badge naming the outcome — `+18 cards`,
  `Already in Travel`, `Delete deck` — and turn red the moment a target
  refuses. Every drag has a keyboard equivalent (`useDeckLift.ts`: space lifts,
  arrows move — including between the rail and the table — space drops, escape
  cancels) and every outcome is announced through one aria-live region.
  Destructive actions apply immediately and offer Undo in a toast rather than
  asking for confirmation first, so the screen needs no modal dialog at all.
- Plain CSS, no UI framework — matches the root project's minimal-dependency
  approach.
- Audio playback (issue #114): each reading's clips render as play buttons in
  `EntryDetail`, driven by one shared `HTMLAudioElement`
  (`src/hooks/useAudioPlayer.ts`), so starting a clip stops the previous one.
  Four calls worth knowing:
  - **`EntryDetail` only.** `EntryRow` renders a `<button>`, so a play control
    inside it would nest interactive elements; the row is also too cramped
    (the same conclusion issue #104 reached for tags).
  - **Both `wordAudio` and `audio`, word clip first.** A whole-word recording
    carries connected-speech coarticulation a syllable clip cannot
    (`data/phonology/REVIEW.md` § 16), so it leads; per-syllable clips stay
    reachable for drilling. Same glyphs (♪♪, ♪) as `src/cli/lookup.ts`, but
    that order is reversed there (syllables, then the word clip last) — the
    CLI predates this ordering decision and wasn't updated to match.
  - **Clip licences are credited separately, gated by "Show licensing info".**
    A clip's licence comes from its own sources and can differ from the
    entry's — a CC-BY-SA-4.0 Lingua Libre import on an otherwise CC-BY-4.0
    entry — so distinct clip credits are deduped and listed under the entry's
    licence block rather than assumed covered by it.
  - **Custom buttons, not `<audio controls>`.** A three-syllable reading would
    otherwise render four full-width native players.

  An "Only entries with audio" checkbox filters the list to entries that have
  a clip (`src/search/filters.ts`), applied after search and before
  sorting/grouping so it works in every sort mode. It is not persisted, unlike
  the licensing toggle: returning to a dictionary that silently hides almost
  everything is worse than re-ticking a box.

  Real clips exist for Chaozhou now: `data/phonology/audio/chaozhou.yaml`
  holds 110 per-syllable clips and 8 whole-word clips, merged via the #106
  Lingua Libre importer and #128's follow-on merges. Coverage is still
  partial — most Chaozhou syllables remain unrecorded, and Shantou/Chaoyang
  (issue #37) have no clips at all — so most entries still resolve every
  `audio`/`wordAudio` slot to `null` and the players render nothing for them.
  The empty state distinguishes the two cases: "No matches with a recording"
  when the dataset has *some* audio but the current search/filter combination
  excludes it, versus "No recordings in the dictionary yet" only for a
  dataset with none at all (e.g. a build with no `audio/*.yaml` present).
- `dist/dict.json` and `dist/sounds.json` are fetched at runtime as static
  assets (via `scripts/sync-data.mjs`, not bundled as a JS import), so the
  dataset can grow without bloating the JS bundle.
- Sounds (issue #124): every Peng'im syllable actually attested by a
  Chaozhou-variety headword reading, with its IPA and up to 3 example words —
  precomputed at build time by `src/build/sounds.ts` at the repo root (reuses
  the same attestation logic as `npm run inventory`'s syllable-inventory.yaml
  and the same IPA derivation as `src/build/enrich.ts`), rather than
  re-deriving Peng'im parsing or IPA composition in the browser.
  `SoundsView` groups the list alphabetically by Peng'im initial with a jump
  nav, and filters client-side by Peng'im, IPA, or example text.

  Each sound also carries an `occurrences` count (issue #129): its total
  citation-form plus tone-sandhi-surface occurrence count across the whole
  dictionary — a corpus-derived, per-syllable raw count, distinct from a
  headword's own curated `frequency` (curriculum-commonness) field. Because
  it folds in sandhi, a syllable that's only ever attested as a tone-sandhi
  surface (never spoken in citation form) still gets a `Sound` row, with an
  `occurrences` count but no examples. An "A–Z" / "Frequency" toggle in the
  Sounds tab switches between the alphabetical, letter-grouped view above and
  a flat list ranked by `occurrences` descending (ties broken alphabetically)
  — the letter jump nav only applies to the alphabetical view, since
  frequency order isn't alphabetically contiguous.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `web/dist` to GitHub
Pages on every push to `main` that touches `web/`, `data/`, or `src/`.

Because this repo has no custom domain, the site is served from the project
subpath `https://teochew-works.github.io/teochew-dictionary/`, so
`vite.config.ts` sets `base: '/teochew-dictionary/'` only for that build (via
a `GH_PAGES=true` env var the workflow sets) — local dev/build/preview stay
at `base: '/'`. **If a custom domain is ever attached, `base` must revert to
`'/'` and a `CNAME` file added to `web/public/`, or the deployed site will
serve broken asset URLs.**

**Manual one-time step, outside this repo:** GitHub Pages must be enabled in
the repo's Settings → Pages → Source: "GitHub Actions" before the deploy
workflow's `deploy` job can actually publish anything.

## Out of scope (v1)

Matches the parent issue's explicit non-goals — both are consequences of the
backend-free choice, not independent scoping decisions
([ADR-0019](../docs/adrs/adr-0019.md), [ADR-0020](../docs/adrs/adr-0020.md)):

- User accounts or cross-device progress sync.
- Offline/PWA support.

Audio playback was on this list for v1 and no longer is — the UI shipped in
issue #114. Real Chaozhou recordings exist now (issues #106/#128); what's
still missing is full coverage — most Chaozhou syllables and all of
Shantou/Chaoyang (issue #37) remain unrecorded.
