# @teochew/core

Shared, DOM/React-independent logic for the [Teochew Dictionary](https://github.com/teochew-works/teochew-dictionary):
entry/phonology schemas, Peng'im → IPA/POJ derivation, tone sandhi, the SM-2 flashcard scheduler,
and the deck/search/flashcard pipeline and filter/sort logic that used to live only in `web/`.

Extracted per [ADR-0002](../../docs/adrs/adr-0002.md) so it can be consumed as a versioned npm
dependency by both `web/` in this repo and `mobile/` in the separate
[`teochew-dictionary-app`](https://github.com/teochew-works/teochew-dictionary-app) repo, instead
of being forked or reimplemented per platform. Read that ADR for the *why*, including why this
stays pure TypeScript rather than merging repositories or using a git submodule.

## What's here, and what isn't

- Pure: schemas (`zod`), Peng'im syllable parsing, IPA/POJ/tone-sandhi derivation, the SM-2
  scheduler, and the deck/search/flashcard pipeline, filter and sort logic — plus their test
  suites, moved unchanged from `src/` and `web/src/`.
- **Not here:** anything that touches a filesystem, a database, or the DOM/React Native directly.
  Build-time YAML loading (`readFileSync`/`readdirSync`) stays in the root project's
  `src/phonology/load.ts`; IndexedDB/SQLite persistence adapters and React
  hooks/components stay in each consuming app. That split is deliberate — persistence and
  rendering are exactly where the platforms differ (see ADR-0002).
- A few of the moved phonology files (`ipa.ts`, `poj.ts`, `sandhi.ts`, `syllable.ts` in the root
  project) blended pure derivation with disk-reading convenience wrappers (`toIpa`, `toPoj`,
  `applySandhi`, `createSandhiResolver`). Only the pure, explicit-parameter functions moved here;
  the root project keeps thin wrapper functions of the same name that load the phonology tables
  from disk and call into this package.
- `flashcards/promptMode.ts`, `flashcards/levelFilter.ts` and `settings/pronunciationMode.ts` do
  call `localStorage` directly for their `read*`/`write*` helpers. That's a browser-specific
  persistence detail this package would otherwise keep out — it's here because that's what the
  concrete extraction plan for ADR-0002 called for moving whole. A React Native consumer should
  use the pure types and predicates these files export (`PromptMode`, `isEligibleForMode`,
  `LevelFilterValue`, `isEligibleForLevel`, `PronunciationMode`, …) and implement its own
  persistence — same as this package expects for every other adapter — rather than call the
  `localStorage`-backed `read*`/`write*` helpers.

## Using it

Both `web/` here and (eventually) `mobile/` in the app repo depend on this package the standard
npm way. Within this repo it's linked locally via `"@teochew/core": "file:../packages/core"` (and
`"file:packages/core"` from the repo root) — no registry involved.

```
npm run build       # tsc -p tsconfig.build.json → dist/
npm run typecheck
npm run test
npm run check        # typecheck + test
```

## Publishing

This package is **not yet published** to npm. `.github/workflows/publish-core.yml` builds and
publishes it on a `core-v*` tag push or manual dispatch, but that workflow needs an `NPM_TOKEN`
repository secret that does not exist yet — someone with maintainer access has to add it before the
workflow can do anything. Actually cutting the first real release (npm account, whether `@teochew`
is available as a scope, semver policy from here) is a deliberate decision for the maintainer to
make, not something implied by this package existing.

### Stopgap: a tarball release for `mobile/`

`teochew-dictionary-app`'s `mobile/` lives in a separate repo, so it can't reach this package via
the `file:` link `web/` uses here. Until a real npm publish happens, `.github/workflows/release-core-tarball.yml`
(manual `workflow_dispatch` only, same reasoning as `publish-core.yml`) runs `npm pack` and uploads
the resulting tarball as a GitHub Release asset, tagged `core-tarball-v<version>` — a different
prefix than `publish-core.yml`'s `core-v*`, so triggering one never fires the other. `mobile/`
depends on the resulting asset URL directly (npm supports installing a dependency straight from a
`.tgz` URL). Bump this package's `version` and re-run the workflow to cut a new tarball; each tag is
meant to stay immutable once published, unlike `dict.sqlite`'s rolling release.
