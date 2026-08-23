# Teochew Dictionary — Web UI

A static, backend-free web app for the [Teochew Dictionary](../README.md):
a searchable dictionary browser and a flashcard/SRS trainer, built on top of
the root project's `dist/dict.json`.

This is its own npm project — independent `package.json`, buildable without
touching the root CLI tooling's build/test pipeline.

---

## Prerequisites

- Node `^20.19.0 || >=22.12.0`
- The root project's data must be built first: from the **repo root**, run

  ```bash
  npm install
  npm run build     # → dist/dict.json
  ```

  `web/`'s `predev`/`prebuild` scripts copy `dist/dict.json` into
  `web/public/data/` automatically, but they only *copy* — they don't
  *build* it. If `dist/dict.json` doesn't exist yet, they fail with:

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

- Vite + React + TypeScript, no router — Dictionary and Flashcards are two
  in-app views; the dictionary's entry detail is a master-detail pane, not a
  separate route.
- Search: [Fuse.js](https://www.fusejs.io/) over each entry's precomputed
  `search_keys` (headword, Peng'im with/without tones, POJ with/without
  diacritics, English glosses — see `src/build/enrich.ts` at the repo root).
- Flashcards: a hand-rolled SM-2-style scheduler (`src/srs/scheduler.ts`,
  no dependency) with a 3-button grading UI (Again/Good/Easy), persisted via
  [`idb`](https://github.com/jakearchibald/idb) (IndexedDB `teochew-flashcards`
  database, `cards` object store keyed by entry id).
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
    reachable for drilling. Same order and glyphs (♪♪ then ♪) as
    `src/cli/lookup.ts`.
  - **Clip licences are credited separately, gated by "Show licensing info".**
    A clip's licence comes from its own sources and can differ from the
    entry's — a CC-BY-SA-4.0 Lingua Libre import on an otherwise CC-BY-4.0
    entry — so distinct clip credits are deduped and listed under the entry's
    licence block rather than assumed covered by it.
  - **Custom buttons, not `<audio controls>`.** A three-syllable reading would
    otherwise render four full-width native players.

  No clip exists yet: `data/phonology/audio/*.yaml` is still unwritten
  (issues #36/#37, and the #106 merge follow-on), so every `audio`/`wordAudio`
  slot resolves to `null` and this renders nothing at all today.
- `dist/dict.json` is fetched at runtime as a static asset (via
  `scripts/sync-data.mjs`, not bundled as a JS import), so the dataset can
  grow without bloating the JS bundle.

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

Matches the parent issue's explicit non-goals:

- User accounts or cross-device progress sync.
- Offline/PWA support.

Audio playback was on this list for v1 and no longer is — the UI shipped in
issue #114. What's still missing is the data: no recording exists to play yet.
