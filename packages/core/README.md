# @teochew/core

Shared, DOM/React-independent logic for the [Teochew Dictionary](https://github.com/teochew-works/teochew-dictionary):
entry/phonology schemas, Peng'im → IPA/POJ derivation, tone sandhi, the SM-2 flashcard scheduler,
and the deck/search/flashcard pipeline and filter/sort logic that used to live only in `web/`.

Extracted so it can be consumed as a versioned npm dependency by both `web/` in this repo and
`mobile/` in the separate
[`teochew-dictionary-app`](https://github.com/teochew-works/teochew-dictionary-app) repo, instead
of being forked or reimplemented per platform. The decision is recorded twice, from each side:
[ADR-0024](../../docs/adrs/adr-0024.md) here (what this repo's contributors owe the package —
the boundary rule, versioning, and the release loop) and the app repo's
[ADR-0002](https://github.com/teochew-works/teochew-dictionary-app/blob/main/docs/adrs/adr-0002.md)
(why a shared package beat merging repositories, a git submodule, or reimplementing natively).
Note that *this* repo's ADR-0002 is about phonology varieties, not this package.

## What's here, and what isn't

- Pure: schemas (`zod`), Peng'im syllable parsing, IPA/POJ/tone-sandhi derivation, the SM-2
  scheduler, and the deck/search/flashcard pipeline, filter and sort logic — plus their test
  suites, moved unchanged from `src/` and `web/src/`.
- **Not here:** anything that touches a filesystem, a database, or the DOM/React Native directly.
  Build-time YAML loading (`readFileSync`/`readdirSync`) stays in the root project's
  `src/phonology/load.ts`; IndexedDB/SQLite persistence adapters and React
  hooks/components stay in each consuming app. That split is deliberate — persistence and
  rendering are exactly where the platforms differ (ADR-0024 here; the app repo's ADR-0002).
- A few of the moved phonology files (`ipa.ts`, `poj.ts`, `sandhi.ts`, `syllable.ts` in the root
  project) blended pure derivation with disk-reading convenience wrappers (`toIpa`, `toPoj`,
  `applySandhi`, `createSandhiResolver`). Only the pure, explicit-parameter functions moved here;
  the root project keeps thin wrapper functions of the same name that load the phonology tables
  from disk and call into this package.
- `flashcards/promptMode.ts`, `flashcards/levelFilter.ts` and `settings/pronunciationMode.ts` do
  call `localStorage` directly for their `read*`/`write*` helpers. That's a browser-specific
  persistence detail this package would otherwise keep out — it's here because that's what the
  concrete extraction plan in the app repo's ADR-0002 called for moving whole. A React Native
  consumer should use the pure types and predicates these files export (`PromptMode`,
  `isEligibleForMode`, `LevelFilterValue`, `isEligibleForLevel`, `PronunciationMode`, …) and
  implement its own persistence — same as this package expects for every other adapter — rather
  than call the `localStorage`-backed `read*`/`write*` helpers.

## Using it

Both `web/` here and `mobile/` in the app repo depend on this package the standard npm way.
Within this repo it's linked locally via `"@teochew/core": "file:../packages/core"` (and
`"file:packages/core"` from the repo root) — no registry involved. `mobile/` pins a release
tarball (see Publishing), so it is normal for it to be a version behind the working tree here.

```
npm run build       # tsc -p tsconfig.build.json → dist/
npm run typecheck
npm run test
npm run check        # typecheck + test
```

## Making a change

The rule ([ADR-0024](../../docs/adrs/adr-0024.md)): shared logic changes **here**, once, with its
tests — never by patching the disk-reading wrapper in the root's `src/phonology/`, and never by
adding a local copy to `web/src/` or the app's `mobile/src/`. If a fix seems to need to live in a
consumer, the consumer is missing an adapter, not this package a special case.

The loop, in order:

1. Edit `src/` and its tests; `npm run check` here.
2. **`npm run build` here.** The root and `web/` resolve `@teochew/core` to this directory
   through a `file:` link, but they import `dist/`, which is gitignored and only rebuilt
   automatically by `npm ci`/`npm install` (the `prepare` script). Skip this step and their checks
   run against the previous build and pass for the wrong reason.
3. `npm run check` at the repo root and in `web/` — both consume this package and are where an
   API change shows up. CI runs all three as separate jobs.
4. Bump `version` in `package.json` if the change should reach the mobile app, following the
   semver policy below, and say so in the commit message. `web/` tracks the working tree and needs
   no bump; `mobile/` pins a version and sees nothing until a release is cut.
5. After merge: cut a release (next section), then bump the tarball URL pinned in the app repo's
   `mobile/package.json`. A change mobile needs is not finished until that pin moves.

**Semver, while the major is `0`:** a bug fix or a purely additive export is a patch bump; any
change to an exported signature, an exported type, or observable behaviour a consumer could depend
on is a minor bump. Treat "just renaming an export" as the cross-repo change it is — two
consumers, one of which is not in this repo, depend on this package's surface.

**Known impurity, to be removed:** the `localStorage`-backed `read*`/`write*` helpers described
above violate the boundary this package otherwise keeps. Do not add to them, and do not make a new
consumer depend on them; moving them back into `web/` is a minor bump waiting to happen.

## Publishing

This package is **not yet published** to npm. `.github/workflows/publish-core.yml` builds and
publishes it on a `core-v*` tag push or manual dispatch, but that workflow needs an `NPM_TOKEN`
repository secret that does not exist yet — someone with maintainer access has to add it before the
workflow can do anything. Actually cutting the first real release (npm account, whether `@teochew`
is available as a scope) is a deliberate decision for the maintainer to make, not something
implied by this package existing.

### Stopgap: a tarball release for `mobile/`

`teochew-dictionary-app`'s `mobile/` lives in a separate repo, so it can't reach this package via
the `file:` link `web/` uses here. Until a real npm publish happens, `.github/workflows/release-core-tarball.yml`
(manual `workflow_dispatch` only, same reasoning as `publish-core.yml`) runs `npm pack` and uploads
the resulting tarball as a GitHub Release asset, tagged `core-tarball-v<version>` — a different
prefix than `publish-core.yml`'s `core-v*`, so triggering one never fires the other. `mobile/`
depends on the resulting asset URL directly (npm supports installing a dependency straight from a
`.tgz` URL). Bump this package's `version` and re-run the workflow to cut a new tarball; each tag is
meant to stay immutable once published, unlike `dict.sqlite`'s rolling release.
