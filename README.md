# Teochew Dictionary

[![CI](https://github.com/teochew-works/teochew-dictionary/actions/workflows/ci.yml/badge.svg)](https://github.com/teochew-works/teochew-dictionary/actions/workflows/ci.yml)

A structured, openly-licensed lexicon of Teochew (潮州話), with tooling to derive
romanisations, validate the data, and build it into usable artifacts.

**Data-first.** The product is `data/` — a hand-editable YAML lexicon plus the
phonology tables that describe the language. Everything in `src/` exists to
validate that data and compile it.

---

## Quick start

```bash
npm install
npm run validate     # check the dataset
npm run build        # → dist/
npm run lookup -- 潮州
```

```
潮州  (headword)
  dio5 ziu1  tie⁵⁵ tsiu³³  tiô-tsiu  [chaozhou]
    sandhi: dio7 ziu1
  dio5 ziu1  tio⁵⁵ tsiu³³  tiô-tsiu  [shantou]
  proper-noun  Chaozhou, Teochew
```

Search by Chinese characters, Peng'im (`dio5 ziu1`, `dio ziu`, `dioziu`), POJ
(`tiô-tsiu`, `tio-tsiu`), or an English gloss.

---

## The central design decision

**Peng'im is the only romanisation stored. IPA and POJ are derived.**

An entry records this:

```yaml
- id: dio5-ziu1-潮州
  headword: 潮州
  readings:
    - pengim: dio5 ziu1
      variety: chaozhou
  senses:
    - pos: proper-noun
      gloss_en: [Chaozhou, Teochew]
  sources: [seed]
```

and the build produces this:

```json
{
  "pengim": "dio5 ziu1",
  "ipa": "tie⁵⁵ tsiu³³",
  "poj": "tiô-tsiu",
  "sandhi": "dio7 ziu1",
  "ipa_confidence": "medium",
  "ipa_caveats": ["Chaozhou [ie] ~ Shantou [io] (潮 dio5)."]
}
```

Three things follow from this, and they are the reason for the choice:

1. **A contributor writes one romanisation, not three.** Hand-maintaining
   parallel IPA and POJ columns guarantees they drift.
2. **Fixing the phonology fixes the whole dictionary.** Correcting a vowel
   mapping in one YAML file re-derives every affected entry.
3. **IPA cannot be variety-neutral, and pretending otherwise is a bug.** 潮 is
   [tie⁵⁵] in Chaozhou city and [tio⁵⁵] in Shantou — same word, same Peng'im.
   Varieties are therefore first-class: `chaozhou.yaml` is the reference and
   `shantou.yaml` is a sparse overlay listing only what differs.

Hand-written `ipa:` / `poj:` overrides are available for genuinely irregular
forms, and the validator requires a `note` justifying each one.

### Confidence is tracked, not assumed

Every phoneme mapping carries `confidence: high | medium | low`. A derived form
reports the weakest mapping it used, along with the relevant caveats. This
matters because parts of the analysis are genuinely unsettled — see
[data/phonology/REVIEW.md](data/phonology/REVIEW.md), which lists every open
question and the test words that would resolve it.

A mapping may also carry `sources:`, resolved against `data/sources.yaml` exactly
as an entry's is. It records the evidence a confidence rests on, so that raising
one is an argument someone can check rather than an assertion:

```yaml
e:
  ipa: ɯ
  confidence: high
  sources: [pengim-1960, wikipedia, learnteochew]
```

**The dataset has not been checked by a native speaker.** Tone assignments in
particular are provisional, and the tone sandhi table is flagged
`needs_review: true` in full.

---

## Layout

```
data/                      ← the product
  entries/*.yaml             the lexicon, grouped by semantic field
  phonology/
    pengim.yaml              Peng'im orthography: initials, finals, tones
    poj.yaml                 Peng'im → POJ transliteration
    varieties/
      chaozhou.yaml          reference variety: Peng'im → IPA
      shantou.yaml           sparse overlay on Chaozhou
      chaoyang.yaml          sparse overlay on Chaozhou (Southern Teochew)
    sandhi/chaozhou.yaml     tone sandhi rules
    external/learnteochew.yaml  cached external reference chart (see below)
    audio/chaozhou.yaml      whole-syllable audio clip metadata, per variety
                               (clip bytes hosted on GitHub Releases, not in
                               this repo — see REVIEW.md §§ 11–12)
    REVIEW.md                open linguistic questions
    TTS.md                   synthesis-as-audio-supplement research (issue #58)
  sources.yaml               provenance and licence registry
  staging/                   importer output, awaiting human review
  wordlists/                 checklists tracking growth (see below)
    swadesh-207.yaml           headword checklist, hand-maintained
    syllable-inventory.yaml    full legal syllable checklist, script-regenerated

src/
  schema/                    Zod schemas — source of truth for types + JSON Schema
  phonology/                 syllable parser, IPA/POJ derivation, sandhi, inventory
  build/                     enrichment and artifact generation
  validate/                  whole-dataset validation
  lookup/                    search over the built SQLite
  importers/                 CC-CEDICT, Wiktionary, Learn Teochew
  cli/                       the npm-script entry points

.cache/                    ← generated, gitignored
  wiktionary-pages/          raw Wiktionary wikitext, one file per headword

dist/                      ← generated, gitignored
  dict.json                  everything, enriched
  dict.ndjson                one entry per line, for streaming
  dict.sqlite                indexed + FTS5
  schema.json                 JSON Schema for data/entries/*.yaml
  pengim-schema.json          JSON Schema for data/phonology/pengim.yaml
  poj-schema.json             JSON Schema for data/phonology/poj.yaml
  variety-schema.json         JSON Schema for data/phonology/varieties/*.yaml
  sandhi-schema.json          JSON Schema for data/phonology/sandhi/*.yaml
  external-chart-schema.json  JSON Schema for data/phonology/external/*.yaml
  audio-schema.json           JSON Schema for data/phonology/audio/*.yaml
  syllable-inventory-schema.json  JSON Schema for data/wordlists/syllable-inventory.yaml

web/                       ← static frontend (issue #55), independent npm project
  src/
    types/dict.ts              hand-written types mirroring dist/dict.json
    search/                    Fuse.js wrapper over EnrichedEntry.search_keys
    srs/                       SM-2-style scheduler + IndexedDB persistence (idb)
    views/                     DictionaryView, FlashcardsView
  scripts/sync-data.mjs       copies ../dist/dict.json → web/public/data/ (gitignored)
  public/data/               ← generated, gitignored
  dist/                      ← generated, gitignored (deployed to GitHub Pages)
```

---

## Adding an entry

Add to the appropriate file in `data/entries/`, then run `npm run validate`.

```yaml
- id: gue2-粿                    # lowercase-pengim + headword
  headword: 粿
  readings:
    - pengim: guê2               # tone digit 1–8 on every syllable
  senses:
    - pos: noun
      gloss_en: [rice cake]
      gloss_zh: [粿]
      examples:
        - hanzi: 紅桃粿
          pengim: ang5 to5 guê2
          en: red peach-shaped rice cake
  frequency: 5                   # 1 rare … 5 core everyday
  sources: [seed]                # must resolve against data/sources.yaml
```

The validator checks a good deal more than the schema:

- every Peng'im syllable parses against the orthography
- **checked tones match checked codas** — tones 4 and 8 require a final stop
  (`-b -g -h`), and the other six forbid one. This catches a lot of slips.
- IPA and POJ derivation actually succeeds for every reading
- ids are unique; sources and varieties resolve
- example sentences have as many Peng'im syllables as Han characters

### Peng'im gotchas that bite

- **Stop codas are written `-b -g`**, matching the unaspirated initials —
  十 `zab8`, 六 `lag8`. Not `-p -k`; that is Hokkien POJ.
- **A final `-n` marks nasalisation; `-ng` is a velar coda.** Teochew lost the
  /n/ coda, so `in5` is /ĩ/ while `ing1` is /iŋ/.
- **`ê` and `e` are different vowels** — /e/ and /ɯ/. Dropping the circumflex
  silently changes the word.
- **Syllabic nasals** stand alone (黃 `ng5`, 毋 `m6`) or follow an initial
  (飯 `bng7`).
- **Tones 6 (陽上) and 7 (陽去) are distinct**, unlike Hokkien, which merged them.
  Assign by Middle Chinese category — 上聲 → 6 (卵 `nng6`), 去聲 → 7 (飯 `bng7`).
  See [`data/phonology/REVIEW.md`](data/phonology/REVIEW.md) § 7.

---

## Importing

```bash
npm run import -- cedict path/to/cedict_ts.u8
npm run import -- wiktionary 潮州 食 糜
```

Importers write **proposals** to `data/staging/`, never to `data/entries/`. The
staged files are deliberately not in entry-file format, so they cannot be dropped
in unedited. Merging is a human act.

Two reasons this is worth the friction:

- **Licence hygiene.** Wiktionary and CC-CEDICT are CC-BY-SA-4.0. Merging their
  glosses binds this dataset to share-alike, so that has to be a decision
  someone makes, not something an importer does by accident.
- **CC-CEDICT is a Mandarin dictionary.** It carries no Teochew pronunciation
  whatsoever, so its importer *cannot* propose a reading — only glosses for
  headwords that already exist. Letting a Mandarin source populate a Teochew
  reading would be the most damaging error available here.

Wiktionary readings are validated as Peng'im before being proposed; malformed
candidates are reported rather than imported.

### Growing the lexicon from a checklist

Ad-hoc additions make "how complete is this?" unanswerable. `data/wordlists/`
holds checklists that give growth a defined denominator.

`swadesh-207.yaml`, the Swadesh 1971 basic-vocabulary list, tracks whether
each item's Teochew headword is already `existing` in `data/entries/`,
`to_fetch`, `staged` (an importer proposal exists in `data/staging/`), or
`no_reading` (the importer found nothing). It's a hand-maintained snapshot,
not something a script regenerates.

`wiktionary-teochew-index.yaml` (issue #54) uses the same `status` lifecycle
but at a very different scale and origin. Rather than a hand-picked list of
glosses, `npm run wordlist:wiktionary` enumerates every Wiktionary page whose
wikitext declares a Teochew reading via CirrusSearch's `insource:/mn-t=/`
full-text search (namespace 0) — the direct alternative to guessing
candidates from a Mandarin frequency list (issue #53, superseded) — and
classifies each hit against `data/entries/`. Unlike `swadesh-207.yaml`, no
headword curation is needed: the Wiktionary page title already **is** the
headword. Fetching tens of thousands of headwords needs to be resumable, so

```bash
npm run import -- wiktionary --from-wordlist --limit=500
```

sources `to_fetch` items straight from the checklist instead of argv, merges
its results into `data/staging/wiktionary.yaml` instead of overwriting it, and
flips each processed headword to `staged`/`no_reading` in the checklist —
rerunning the same command only picks up whatever remains. `--delay=MS`
overrides the default 200ms between requests.

`syllable-inventory.yaml` (issue #30) is a third kind of checklist: every
legal Peng'im syllable the orthography in `data/phonology/pengim.yaml` allows,
one row per variety-tagged attestation, generated by

```bash
npm run inventory
```

Unlike `swadesh-207.yaml`, this file **is** script-regenerated — it's 100%
derivable from `pengim.yaml` and `data/entries/`, so a stale copy fails
`npm run check` (an in-memory regenerate is diff-checked against the
committed file). Each syllable's `varieties[<id>].status` is `attested` — some
entry's reading in that variety uses it as a citation form
(`attested_entries`) or as the tone-sandhi surface form of a non-final
syllable (`sandhi_attested_entries`, issue #48) — or `unattested`; `external`
records whether an independent published chart corroborates the syllable's
rime, refreshed separately and offline via

```bash
npm run xref -- learnteochew
```

which caches `data/phonology/external/learnteochew.yaml` — network access
stays confined to that command, same as `npm run import`. See
`data/phonology/REVIEW.md` § 10 for the design and its known caveats.

### Caching Wiktionary pages locally (issue #79)

The hand-merge below reads each candidate's Wiktionary page to write its
gloss, and the audit pass then reads the same page again to check the result.
Those fetches are the bulk of the cost, and none of them survive an
interruption — a subagent that dies halfway through a batch re-downloads
everything on retry.

**One-time setup:** `.cache` must be a symlink to wherever you want the page
cache to actually live (it grows to tens of thousands of small files, so it's
worth keeping outside any one worktree, and shared across every worktree of
this repo, rather than accumulating separately inside each):

```bash
ln -s /path/to/your/wiktionary-page-cache .cache
```

The command refuses to run rather than silently creating a plain directory in
its place if `.cache` is missing, isn't a symlink, or is a symlink whose
target doesn't exist or isn't a directory — with one exception: a fresh `git
worktree` of this repo starts with no `.cache` of its own, so if the main
checkout already has a working `.cache` symlink, the command mirrors it into
the new worktree automatically rather than making that a manual step every
time a worktree is created.

```bash
npm run cache:wiktionary
```

downloads every headword's raw wikitext to `.cache/wiktionary-pages/` over
plain HTTP, no model involved, so the expensive reasoning step is no longer
welded to the flaky network one. It caches **every** headword in
`wiktionary-teochew-index.yaml` whatever its `status`, not just the `staged`
ones: an already-merged `existing` entry is exactly what a later re-verification
pass needs its source page for.

State is the filenames, so there is no manifest to drift out of sync with the
directory:

```
.cache/wiktionary-pages/
  潮州.wikitext        the page, raw and unextracted
  無此字.miss          empty marker: asked, and there is no such page
```

A *failed request* writes neither, deliberately — recording a network blip as a
permanent miss would mean never retrying it.

```bash
npm run cache:wiktionary -- --resume            # only fetch what is not on disk yet
npm run cache:wiktionary -- --resume --limit=500  # ...500 *new* pages, not 500 skips
npm run cache:wiktionary -- --delay=200 --concurrency=4
npm run cache:wiktionary -- 挪威 挫折              # ad-hoc, bypassing the wordlist
```

`--resume` (alias `--continue`) is the mode a long sync gets re-invoked with
after a `Ctrl-C`, a network blip, or a session limit; without it a run refetches
and overwrites everything. `--delay` is a rate limit on request *starts* shared
across all workers rather than a per-worker sleep, so `--concurrency` never
makes the run hit Wiktionary harder than `--delay` allows.

Expect failures on a run this size, and don't read them as breakage. Most
requests answer in under a second, but roughly one in ten stalls until it hits
the 30s timeout; those are reported as failures and left *uncached*, precisely
so `--resume` retries them rather than a dead connection being memorialised as
"no such page". Raising `--concurrency` stops one stall from blocking the queue,
which is the main reason to bother with it — the measured gain is real but
erratic. Network-touching, so kept out of `npm run check` like `npm run import`
and `npm run xref`.

Nothing in the repo reads the cache yet: populating it and teaching the
drafting/audit passes to prefer it over a live fetch are separate steps.

### Hand-merging Wiktionary candidates into entries (issue #68)

`wiktionary-teochew-index.yaml`'s `staged` items (15,845 at the time of
issue #54/#67) are reading-only — a headword and a peng'im, nothing else.
The Wiktionary importer never fetches a gloss, by design (licence hygiene
again: readings and glosses are separate decisions). So merging one into
`data/entries/` still needs a human, or an agent, to read the headword's own
page at `https://en.wiktionary.org/wiki/<headword>` and write its gloss,
part of speech, and — where the page gives one — an example, the same way
the 141 entries from issue #5 were done. That per-entry cost is why 15,845
candidates gets worked in many small batches rather than one PR.

```bash
npm run batch:wiktionary -- --limit=25
```

lists the next batch: the first N `wiktionary-teochew-index.yaml` items
still `status: staged`, cross-referenced against their
`data/staging/wiktionary.yaml` proposal. Unflagged proposals (a single,
unambiguous reading) come first; `--include-flagged` pulls from the
multi-reading tail instead. Re-run it after merging a batch — the status
flip below means it never repeats a headword, so "next batch" is always
whatever is left.

Per headword in a batch:

1. Fetch its Wiktionary page for a gloss and part of speech (single-reading
   proposals), or to judge which candidate reading(s) are genuine Chaozhou
   colloquial forms (multi-reading proposals — keep only the genuine ones,
   set `needs_review: true`, and summarize why in `senses[].note`, e.g.
   `ciu7-樹` in `data/entries/nature.yaml`). Never invent a reading or a
   gloss that the page doesn't support.
2. Add the entry to whichever existing category file fits its meaning
   (`data/entries/*.yaml` — no new Wiktionary-only file), with
   `sources: [wiktionary]` and `retrieved` carried across from the staging
   proposal's date.
3. Flip the headword's `wiktionary-teochew-index.yaml` entry from
   `staged` to `existing` with `entry_id: <the new id>` — the same
   `status` lifecycle `swadesh-207.yaml` already uses, so this doubles as
   the batch's resumability marker.

Then `npm run inventory` (new syllables need re-deriving) and `npm run
check` before opening the PR, same as any other change. One PR per batch,
referencing #68 without closing it — it stays open until no `staged` items
remain.

---

## Licensing

**Code and data are licensed separately — deliberately, not as an artifact of
reusing one licence for everything.**

| | Licence | File |
|---|---|---|
| `src/` — the tooling | BSD-3-Clause | [`LICENSE`](LICENSE) |
| `web/` — the frontend app | BSD-3-Clause | [`LICENSE`](LICENSE) |
| `data/` — default | CC-BY-4.0 | [`LICENSE-DATA-CC-BY-4.0`](LICENSE-DATA-CC-BY-4.0) |
| `data/` — entries citing a share-alike source | CC-BY-SA-4.0 | [`LICENSE-DATA-CC-BY-SA-4.0`](LICENSE-DATA-CC-BY-SA-4.0) |
| `data/` — attribution owed to `unihan` | Unicode-DFS-2016 | [`LICENSE-DATA-UNICODE-DFS-2016`](LICENSE-DATA-UNICODE-DFS-2016) |
| `data/phonology/audio/` — original recordings | CC-BY-4.0 | [`LICENSE-DATA-CC-BY-4.0`](LICENSE-DATA-CC-BY-4.0) |

The data licence is CC-BY-4.0, not BSD-3-Clause, on purpose: a software
licence's "redistributions of source code / in binary form" language doesn't
fit a lexicon, and only the CC family addresses *sui generis* database
rights — the EU-style right over a compilation, separate from copyright in
individual facts, that a plain software licence like BSD is silent on. It's
also the idiom the comparable projects in this space actually use (Wiktionary,
iTaigi, Tatoeba) — nobody licenses lexical data under a software licence.

**An entry's licence is derived from its `sources`, never hand-written** —
computed by [`src/data/licence.ts`](src/data/licence.ts) and shipped as
`licence` and `attributions` fields on every entry in `dist/dict.json` and
`dist/dict.sqlite`, so a consumer can filter to a purely permissive subset
without re-deriving the rule themselves. The two fields answer different
questions:

- **`licence`** — what governs redistributing the entry. CC-BY-4.0 (the data
  default), unless a cited source is share-alike, in which case that source's
  licence covers the whole entry: a merged record is an adaptation, not a mere
  collection, so it can't keep its parts separately licensed. Wiktionary is
  CC-BY-SA-4.0, so an entry that draws a reading or gloss from it becomes
  CC-BY-SA-4.0 as a whole.
- **`attributions`** — whose notice must *also* be retained. Every cited
  source whose own licence differs from CC-BY-4.0, share-alike or not. A
  permissive-but-distinct licence never changes `licence` — citing `unihan`
  (Unicode-DFS-2016) doesn't move an entry off CC-BY-4.0 — but its notice
  still has to travel with the entry, so it's not silently dropped. Every
  distinct licence text a source can carry has its own `LICENSE-DATA-*` file
  at the repo root, per the table above.

**Every source also has a `kind`** — `import` (material is copied out of it
into the dataset; `licence` is required, and defaults to `import` for a source
that doesn't say) or `reference` (cited as evidence, e.g. to justify a
phonology mapping's `confidence`, but never reproduced; `licence` is
optional, since no licence obligation attaches to material that was never
copied — `pengim-1960` and `learnteochew` carry none). An entry's `sources:`
may cite only `import` ids; a phonology mapping's `sources:` may cite either,
since a mapping records evidence about the language, not the origin of an
entry's content. `wikipedia` is `kind: reference` despite having a real
(share-alike) licence — that's what stops it being cited as an entry source
and silently contaminating the dataset with CC-BY-SA-4.0. The validator
rejects an entry that cites a `reference` source, rather than silently
accepting it.

**As of the Swadesh-207 Wiktionary merge (issue #5), the dataset is a mix of
both licences** — 103 entries cite only `seed` and remain CC-BY-4.0; 141
entries cite `wiktionary` and are CC-BY-SA-4.0. This is why importers write to
`data/staging/` and never to `data/entries/`: merging a CC-BY-SA gloss into an
entry, and thereby relicensing that entry, stays a deliberate human act rather
than something a script does by accident.

**Audio clips follow the same rule.** A clip's `licence` (`AudioReference` in
`dist/dict.json`) derives from its `sources` exactly like an entry's, via the
`teochew-dictionary-audio` id in `data/sources.yaml` — a recorded performance
is copyrightable separately from the phonological fact it captures, so it
needs its own provenance, not a free ride on the entry it's attached to.
Per-clip speaker credit lives in the clip's own `speaker` field in
`data/phonology/audio/*.yaml` (a pseudonymous identifier), not the
`attributions` array, since every clip cites the one CC-BY-4.0 source —
but `speaker` isn't part of `AudioReference`, so it never reaches
`dist/dict.json`; it's source-data-only. Recording a speaker also requires their
consent to release the recording — see [`AUDIO-CONSENT.md`](AUDIO-CONSENT.md)
— which is a separate, genuinely new concern from copyright licensing. See
`data/phonology/REVIEW.md` § 13 for the full rationale.

**Why not synthesize audio instead of recording it.**
[`data/phonology/TTS.md`](data/phonology/TTS.md) (issue #58) surveys
text-to-speech/IPA-to-audio synthesis as a possible supplement to
volunteer recordings and finds no near-term viable option: no commercial
TTS platform has a Teochew/Southern-Min voice or a way to carry this
dataset's Chao-numeral tone contours, and the one technically viable path
(a from-scratch eSpeak-NG phoneme profile) isn't worth the linguistics
effort against a recording gap that's already small and bounded.

**`npm run validate`/`checkAudio` only checks the clip metadata is internally
consistent** (legal syllable, resolvable licence, etc.) — it does not fetch
`clip.url` or verify `checksum` against the real bytes, since those live on
GitHub Releases, not in this repo. That's a separate, network-touching step:

```bash
npm run audio:verify
```

which fetches every declared clip and confirms its checksum matches — kept
out of `npm run check` for the same reason `npm run xref`/`npm run import`
are, so `check` stays fast, offline, and CI-safe.

---

## Commands

| | |
|---|---|
| `npm run validate` | check the dataset; non-zero exit on error |
| `npm run build` | validate, then emit `dist/` |
| `npm run lookup -- <query>` | search the built dictionary |
| `npm run import -- <source>` | fetch proposals into `data/staging/` |
| `npm run inventory` | regenerate `data/wordlists/syllable-inventory.yaml` |
| `npm run wordlist:wiktionary` | regenerate `data/wordlists/wiktionary-teochew-index.yaml` |
| `npm run batch:wiktionary -- --limit=N` | list the next Wiktionary merge batch (issue #68) |
| `npm run cache:wiktionary` | sync Wiktionary wikitext into `.cache/wiktionary-pages/` (issue #79) |
| `npm run xref -- <source>` | refresh a cached external phonology chart |
| `npm run audio:verify` | fetch every audio clip and verify its checksum |
| `npm run schema` | emit the JSON Schemas alone |
| `npm test` | unit tests + dataset guards |
| `npm run check` | typecheck + test + validate |

---

## Web UI

`web/` is a static, backend-free frontend (issue #55): a dictionary browser
with client-side search plus a flashcard/SRS trainer, built on Vite + React +
TypeScript. It's an independent npm project with its own `package.json`,
consuming `dist/dict.json` at runtime rather than duplicating any
data-loading logic.

It requires `dist/dict.json` to already exist — run `npm run build` at the
repo root first, then see [`web/README.md`](web/README.md) for how to run,
build, and deploy it.

> `.github/workflows/deploy.yml` publishes `web/dist` to GitHub Pages on every
> push to `main`, but GitHub Pages itself still needs to be enabled once in
> this repo's Settings → Pages before that workflow can actually publish
> anything.

---

## Status

264 entries. 244 cover core everyday vocabulary against the Swadesh-207
checklist — numerals, pronouns, kinship, body parts, animals, nature, common
verbs and descriptives, place names, function words — 141 of those merged
from the Wiktionary import (issue #5). A further 20 are the first batch of
the much larger Wiktionary index sweep (issue #68, 15,825 `staged` proposals
remaining after this batch). Entries merged from Wiktionary carry
`needs_review: true` wherever Wiktionary returned more than one candidate
reading or the headword choice itself was a guess; a native speaker still
needs to confirm them.

The most valuable next contributions, in order:

1. **Working through the issue #68 batches** — `npm run batch:wiktionary`
   lists the next batch of `data/staging/wiktionary.yaml` proposals to
   hand-merge; see "Hand-merging Wiktionary candidates into entries" above.
2. **A native speaker confirming the `needs_review` entries from the
   Wiktionary merge** — around 100 entries carry unresolved multi-reading
   ambiguity or headword/register uncertainty, tracked per-item in
   `data/wordlists/swadesh-207.yaml`.
3. **Confirming the sandhi table** in `data/phonology/sandhi/chaozhou.yaml`. It is
   flagged `needs_review: true` in full, and published descriptions disagree with
   each other, so this is the largest remaining unknown.
4. **A native speaker walking [REVIEW.md](data/phonology/REVIEW.md).** §1, the
   `e`/`ê` vowel split, is resolved; §2–§7 are not.
5. **The 16 Swadesh items still `no_reading`** in
   `data/wordlists/swadesh-207.yaml` — the importer found nothing for these
   headword guesses; they need better headwords before they can be re-fetched.
