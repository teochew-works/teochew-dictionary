# Teochew Dictionary

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
    sandhi/chaozhou.yaml     tone sandhi rules
    REVIEW.md                open linguistic questions
  sources.yaml               provenance and licence registry
  staging/                   importer output, awaiting human review
  wordlists/                 headword checklists tracking growth (see below)

src/
  schema/                    Zod schemas — source of truth for types + JSON Schema
  phonology/                 syllable parser, IPA/POJ derivation, sandhi
  build/                     enrichment and artifact generation
  validate/                  whole-dataset validation
  lookup/                    search over the built SQLite
  importers/                 CC-CEDICT, Wiktionary
  cli/                       the npm-script entry points

dist/                      ← generated, gitignored
  dict.json                  everything, enriched
  dict.ndjson                one entry per line, for streaming
  dict.sqlite                indexed + FTS5
  schema.json                JSON Schema for data/entries/*.yaml
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
holds headword checklists that give growth a defined denominator — currently
`swadesh-207.yaml`, the Swadesh 1971 basic-vocabulary list, with each item's
`status` tracking whether its Teochew headword is already `existing` in
`data/entries/`, `to_fetch`, `staged` (an importer proposal exists in
`data/staging/`), or `no_reading` (the importer found nothing). It's a
hand-maintained snapshot, not something a script regenerates.

---

## Licensing

**[BSD 3-Clause](LICENSE)** — covering both the tooling in `src/` and the
hand-curated lexicon in `data/`.

One caveat that will matter later. The importers pull from **Wiktionary and
CC-CEDICT, which are CC-BY-SA-4.0** — a share-alike licence that is *not*
compatible with redistributing the result under BSD-3-Clause alone. Merging any
of their glosses would place those entries under share-alike terms and force a
relicensing decision on the dataset as a whole.

This is why importers write to `data/staging/` and never to `data/entries/`, and
why every entry records its `sources`. Nothing imported has been merged, so the
question is still open rather than already answered by accident.

---

## Commands

| | |
|---|---|
| `npm run validate` | check the dataset; non-zero exit on error |
| `npm run build` | validate, then emit `dist/` |
| `npm run lookup -- <query>` | search the built dictionary |
| `npm run import -- <source>` | fetch proposals into `data/staging/` |
| `npm run schema` | emit the JSON Schema alone |
| `npm test` | unit tests + dataset guards |
| `npm run check` | typecheck + test + validate |

---

## Status

101 entries covering core everyday vocabulary — numerals, pronouns, kinship,
food, common verbs and descriptives, place names. Enough to exercise the whole
pipeline end to end; nowhere near enough to be a usable dictionary.

The most valuable next contributions, in order:

1. **Confirming the sandhi table** in `data/phonology/sandhi/chaozhou.yaml`. It is
   flagged `needs_review: true` in full, and published descriptions disagree with
   each other, so this is the largest remaining unknown.
2. **A native speaker walking [REVIEW.md](data/phonology/REVIEW.md).** §1, the
   `e`/`ê` vowel split, is resolved; §2–§7 are not.
3. **Volume** — the importers exist to make this less manual, but every proposal
   still needs a human.
