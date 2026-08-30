# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Architecture Decision Records — read these first

The **why** behind this project lives in [docs/adrs/](docs/adrs/). Where `README.md` explains *how
to use the project today* and [data/phonology/REVIEW.md](data/phonology/REVIEW.md) tracks *open
linguistic questions*, the ADRs record *why it is shaped this way and what was rejected*.

**Before changing anything in the Invariants table below, read the ADR that governs it.** Several
of these rules look like friction worth removing until you read why they exist — the importer
staging boundary and the offline-`check` rule in particular.

Start at [docs/adrs/README.md](docs/adrs/README.md) for the inventory.

| Skill                    | Use it when                                     |
|--------------------------|-------------------------------------------------|
| **review-adr**           | Adding, amending, or auditing an ADR            |
| **update-adr-inventory** | An ADR is added, or its status or title changes |

Branches that add or amend an ADR are named `adr/<something>` (see the `review-adr` skill).

## Project Overview

A structured, openly-licensed lexicon of Teochew (潮州話), with tooling to derive romanisations,
validate the data, and compile it into usable artifacts, plus a static web UI.

**`data/` is the product.** It is hand-editable YAML — the lexicon, the phonology tables, and the
provenance registry. Everything in `src/` exists to validate that data and compile it; `dist/` is
generated and gitignored. See [ADR-0005](docs/adrs/adr-0005.md).

**Peng'im is the only romanisation stored.** IPA, POJ and tone-sandhi forms are *derived* at build
time from the phonology tables. A contributor writes one romanisation, not four, and fixing a
mapping re-derives every affected entry. See [ADR-0001](docs/adrs/adr-0001.md).

## Invariants

Each of these is a decision with a record, not a style preference. Do not work around one without
reading its ADR first — and if the ADR is genuinely wrong, amend the ADR rather than quietly
diverging from it.

1. **Never hand-write `ipa:`/`poj:` on a reading.** They are derived. The override fields exist for
   genuinely irregular forms, and the schema *requires* a justifying `note`.
   → [ADR-0001](docs/adrs/adr-0001.md)
2. **Chaozhou is the reference variety.** Other varieties are sparse overlays listing only what
   differs — never a full copy of the syllabary. → [ADR-0002](docs/adrs/adr-0002.md)
3. **Every phonology mapping carries a `confidence`.** Raising one is an argument: cite `sources:`.
   Derived forms propagate the *weakest* mapping used. → [ADR-0003](docs/adrs/adr-0003.md)
4. **Schemas are Zod, in `src/schema/`.** Types and `dist/*-schema.json` are both derived from
   them — never hand-edit an emitted schema. → [ADR-0004](docs/adrs/adr-0004.md)
5. **Store nothing derivable.** If it can be computed from `data/`, compute it in `src/build/` and
   ship it in `dist/`. → [ADR-0005](docs/adrs/adr-0005.md)
6. **Importers write only to `data/staging/`, never to `data/entries/`.** Merging is a human act —
   it relicenses the entry. Staged files are deliberately not in entry format so they cannot be
   dropped in unedited. → [ADR-0006](docs/adrs/adr-0006.md)
7. **An entry's `licence`/`attributions` are derived from its `sources`** by
   [src/data/licence.ts](src/data/licence.ts). Never hand-write them.
   → [ADR-0008](docs/adrs/adr-0008.md)
8. **An entry's `sources:` may cite only `kind: import` ids.** A `kind: reference` source is
   evidence, never copied content; citing one from an entry is a validation error.
   → [ADR-0009](docs/adrs/adr-0009.md)
9. **`npm run check` must stay fast, offline and CI-safe.** Anything touching the network is its
   own command (`import`, `cache:wiktionary`, `xref`, `audio:verify`).
   → [ADR-0012](docs/adrs/adr-0012.md)
10. **`.cache` must be a symlink** to a directory outside any checkout, shared across worktrees.
    Tooling refuses to run rather than silently creating a real directory.
    → [ADR-0013](docs/adrs/adr-0013.md)
11. **Audio bytes never enter git.** Clips are GitHub Release assets; `data/phonology/audio/*.yaml`
    holds only URL + checksum + licence. The one bounded exception is transient staged recordings.
    → [ADR-0014](docs/adrs/adr-0014.md), [ADR-0017](docs/adrs/adr-0017.md)
12. **Backfill scripts splice by byte offset**, never parse→stringify — entry files are hand-typed,
    and a round-trip rewraps scalars and destroys blank-line grouping. Dry-run by default,
    `--write` to commit, only ever fill an absent field. → [ADR-0018](docs/adrs/adr-0018.md)
13. **`web/` is an independent npm project** consuming `dist/`. Build at the repo root first, and
    never duplicate data-loading or phonology logic in the browser.
    → [ADR-0019](docs/adrs/adr-0019.md)

## Common Commands

```bash
npm run check          # typecheck + test + validate — offline, run this before committing
npm run validate       # check the dataset; non-zero exit on error
npm run build          # validate, then emit dist/
npm run lookup -- 潮州  # search the built dictionary
npm test               # unit tests + dataset guards
```

Network-touching, run deliberately and never from `check`:

```bash
npm run import -- <source>     # fetch proposals into data/staging/
npm run cache:wiktionary       # sync Wiktionary wikitext into .cache/
npm run xref -- <source>       # refresh a cached external phonology chart
npm run audio:verify           # fetch every clip and verify its checksum
```

Regeneration and maintenance:

```bash
npm run inventory                              # regenerate data/wordlists/syllable-inventory.yaml
npm run wordlist:wiktionary                    # regenerate the Wiktionary headword index
npm run batch:wiktionary -- --limit=N          # list the next hand-merge batch
npm run backfill:wiktionary-tags [-- --write]  # dry-run by default
npm run backfill:mandarin-level -- <path> [-- --write]
npm run schema                                 # emit the JSON Schemas alone
```

In `web/` (its own project): `npm run dev`, `npm run check`, `npm run build`. Both projects'
checks run separately in CI — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Code Architecture

```
src/schema/       Zod schemas — source of truth for types + JSON Schema   (ADR-0004)
src/phonology/    syllable parser, IPA/POJ derivation, sandhi, inventory  (ADR-0001, ADR-0002)
src/build/        enrichment and artifact generation                      (ADR-0005)
src/validate/     whole-dataset validation                                (ADR-0012)
src/lookup/       search over the built SQLite
src/importers/    CC-CEDICT, Wiktionary, Lingua Libre, local recordings   (ADR-0006)
src/data/         source registry and licence derivation                  (ADR-0008, ADR-0009)
src/cli/          the npm-script entry points
web/              static React frontend, independent npm project          (ADR-0019)
```

## Key Documentation

| Document                                             | Purpose                                                        |
|------------------------------------------------------|----------------------------------------------------------------|
| [docs/adrs/README.md](docs/adrs/README.md)           | Architecture Decision Records (**why**)                        |
| [README.md](README.md)                               | How to use the project today (**how**)                         |
| [data/phonology/REVIEW.md](data/phonology/REVIEW.md) | Open linguistic questions, and what resolves them              |
| [web/README.md](web/README.md)                       | Frontend architecture, dev and deployment                      |
| [AUDIO-CONSENT.md](AUDIO-CONSENT.md)                 | Speaker consent process (tracked outside the repo)             |
| [data/phonology/TTS.md](data/phonology/TTS.md)       | Why synthesis was rejected ([ADR-0016](docs/adrs/adr-0016.md)) |
| [docs/adrs/adr-0006.md](docs/adrs/adr-0006.md)       | Why importers may never write to `data/entries/`               |
| [docs/adrs/adr-0008.md](docs/adrs/adr-0008.md)       | Why an entry's licence is computed, not written                |

## Working on the Data

Peng'im gotchas that bite — see [README.md § Peng'im gotchas](README.md#pengim-gotchas-that-bite)
for the full list. The ones that cause silent wrong data:

- Stop codas are `-b -g` (not `-p -k`, which is Hokkien POJ); tones 4 and 8 require one, the other
  six forbid one.
- A final `-n` marks **nasalisation**; `-ng` is a velar coda. `in5` is /ĩ/, `ing1` is /iŋ/.
- `ê` and `e` are different vowels (/e/ and /ɯ/). Dropping the circumflex changes the word.
- Tones 6 (陽上) and 7 (陽去) are distinct, unlike Hokkien. Assign by Middle Chinese category.

**The dataset has not been checked by a native speaker.** Tone assignments are provisional and the
sandhi table is flagged `needs_review: true` in full. When adding data you are not sure of, set
`needs_review: true` rather than guessing confidently — see [ADR-0003](docs/adrs/adr-0003.md).
