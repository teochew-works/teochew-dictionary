# Open questions for a native speaker or specialist

The phonology tables were assembled from general descriptions of Teochew. The
mappings marked `confidence: high` are well attested and consistent across
sources. The questions below are the ones that were **not settled** when the
tables were written, and the dataset carries the unresolved ones at lower
confidence so that derived IPA can be trusted selectively rather than wholesale.

Anything here can be corrected by editing a YAML file. None of it requires
touching code.

A resolved question keeps its number and stays in place rather than being
deleted, so that references to it do not rot and the reasoning behind a `high`
mapping stays readable. A mapping records the evidence it rests on in a
`sources:` list, resolved against `data/sources.yaml`. The confidence-and-sources
model itself is recorded as [ADR-0003](../../docs/adrs/adr-0003.md).

**Open questions here; settled decisions in `docs/adrs/`.** Several sections
below opened with a **Decision:** paragraph and have since graduated into an
Architecture Decision Record — they stay here in full as the working narrative,
and the ADR is the citable summary:

| Section                                          | ADR                                     |
|--------------------------------------------------|-----------------------------------------|
| § 10 the syllable inventory (issue #30)          | [ADR-0010](../../docs/adrs/adr-0010.md) |
| § 12 audio asset hosting (issue #32)             | [ADR-0014](../../docs/adrs/adr-0014.md) |
| § 13 audio licensing and speaker consent (#33)   | [ADR-0015](../../docs/adrs/adr-0015.md) |
| § 15 `dist/schema.json` scope (issue #39)        | [ADR-0004](../../docs/adrs/adr-0004.md) |
| § 16 importing Lingua Libre/Commons audio (#106) | [ADR-0015](../../docs/adrs/adr-0015.md) |
| § 17 recording clips from the Sounds tab (#128)  | [ADR-0017](../../docs/adrs/adr-0017.md) |

See [docs/adrs/README.md](../../docs/adrs/README.md) for the full inventory.

---

## 1. The `e` / `ê` vowel split  ·  `varieties/chaozhou.yaml`  ✅ **Resolved 2026-07-27**

**Ruling:** `ê` → /e/ and bare `e` → /ɯ/ are **confirmed**, both raised to
`confidence: high`. The Shantou overlay was **corrected**: Shantou does *not*
merge /ɯ/ into /u/.

Settled from published description rather than by ear, which the sources turned
out to support more strongly than the original hedge assumed:

- **The contrast is definitional, not empirical.** Peng'im *is* 廣東省教育廳
  《潮州話拼音方案》(1960), already cited in `pengim.yaml`. That scheme assigns the
  two letters separate values — `ê` = [e] (啞), `e` = [ɯ] (余). Asking whether the
  circumflex marks a real distinction is asking what the orthography means, and
  the orthography answers.
- **It is the primary isogloss of Teochew dialectology.** Presence or absence of
  /ɯ/ is *the* criterion by which the sub-dialects are classified. A vowel that
  load-bearing is not weakly attested.
- **Corroborated outside the Wikipedia family** by an independent Peng'im vowel
  table giving `ê` = /e/ and `e` = /ɯ/, with /lɯ/ 汝 and /tsɯ/ 書 — two of the
  test words below.

**The Shantou correction.** `shantou.yaml` had encoded Shantou as merging /ɯ/ into
/u/, calling it "the most audible single difference between the two varieties".
That is the *Southern* Teochew merger (Chaoyang, Puning, Huilai). Swatow — urban
Shantou — is **Northern** Teochew and keeps /ɯ/, alongside Chaozhou city, Jieyang
and Raoping. Peng'im settles it from the other direction as well: the 1960 scheme
is based on the Swatow dialect, so its `e` = /ɯ/ *is* a Swatow value. The `nuclei`
override is gone and Shantou now inherits /ɯ/; what actually separates the two
varieties is §2's `io` rime and the tone-2 contour.

**Residual uncertainty, deliberately not blocking `high`.** Descriptions vary in
the *symbol* for the bare-`e` vowel — [ɯ] ~ [ɤ] ~ [ə] — and for `ê` between [e]
and [ɛ]. This dataset follows the scheme. That is a transcription convention, not
doubt about which phoneme is meant, and the confidence scale here rates the
mapping rather than the choice of IPA glyph.

**Still worth a speaker's ear.** None of the above is a recording. If you speak
the language, the original test remains the fastest check: 魚 `he5`, 豬 `de1`, 書
`ze1`, 你 `le2` (all bare `e`) against 茶 `dê5`, 肉 `nêg8`, 百 `bêh4` (all `ê`),
in citation form. All seven are in the lexicon, and `tests/derive.test.ts` pins
them, so a correction would surface immediately.

**Follow-up:** the /ɯ/ → /u/ merger is real; it was only attached to the wrong
variety. Modelling it properly means a `varieties/chaoyang.yaml` that does not
exist yet — Southern Teochew is currently unrepresented in the dictionary. See
issue #10. **Addressed — see §9.**

## 2. Chaozhou `io` → [ie] fronting  ·  `varieties/chaozhou.yaml` → `irregular`

**Encoded as:** Chaozhou `io` → [ie]; Shantou `io` → [io].

This is the difference behind 潮 being [tie⁵⁵] in Chaozhou city and [tio⁵⁵] in
Shantou. The open rime is reasonably attested. **Whether the fronting extends to
`iong`** is marked `confidence: low` — it is a guess by analogy, and may well be
wrong. If it does not front, delete the `iong` key from the Chaozhou `irregular`
block and the compositional rule takes over.

**Test words:** 潮 `dio5`, 少 `zio2`, 上 `ziong6`.

Citations recorded: `io` and `ioh` (both varieties) now carry `sources:
[wikipedia, learnteochew]` in the YAML — Wikipedia attests both directly,
including `ioʔ → ieʔ` for the checked rime, not merely by analogy from the
open rime. `iong` (both varieties) has no source addressing the nasal-coda
rime specifically; its `note` says so explicitly, and Shantou's copy is now
also `confidence: low` to match Chaozhou's — both are equally uncited
extrapolations from the open-rime pattern, so neither should outrank the
other. This is bookkeeping, not resolution — the open questions above stand.

## 3. The tone sandhi table  ·  `sandhi/chaozhou.yaml`  ✅ **Resolved 2026-07-29**

**Ruling:** all 8 rules **confirmed or corrected**, `needs_review` cleared.

The `to` field (which tone NUMBER a citation tone surfaces as — what actually
drives the Peng'im respelling) needed no correction. It is corroborated by two
independent sources agreeing completely: this dataset's pre-existing values, and
[Learn Teochew](https://learnteochew.com/pages/pronunciation.html)'s own tone
sandhi table, id `learnteochew`. Wikipedia's Teochew Min article gives the same
mapping again as a named "simplified" convention specific to Chaozhou, Chenghai
and Jieyang (Shantou/Raoping differ only in tone 3, which goes to 5 there instead
of 2) — a third independent confirmation.

The `contour` field (the actual Chao pitch value, which does not drive anything
downstream but is exposed as metadata) was wrong for three of the eight rules.
Wikipedia's article carries a detailed Chaozhou/Chenghai sandhi table sourced to
Zhang, Jingfen. *Tono-types and Tone Evolution: The Case of Chaoshan* (Springer,
2021) — source id `zhang-2021-tonotypes`. That table was checked directly against
the article's page markup, not a search-engine summary, because Chao pitch digits
(`34` vs `24` vs `43`...) are exactly the kind of detail a text summarizer garbles
silently.

| Citation | → Surface | Old contour | Corrected contour |
|----------|-----------|-------------|--------------------|
| 1 (33)   | 1         | 23          | **34**             |
| 2 (53)   | 6         | 35          | 35 (confirmed)     |
| 3 (213)  | 2         | 53          | 53 (confirmed)     |
| 4 (2)    | 8         | 5           | 5 (confirmed)      |
| 5 (55)   | 7         | 11          | **23**             |
| 6 (35)   | 7         | 31          | **21**             |
| 7 (11)   | 7         | 11          | **23**             |
| 8 (4)    | 4         | 2           | 2 (confirmed)      |

Rule 1 was the clearest error: Zhang's table calls out Chaozhou's tone 1 staying
*non-level* in sandhi (33 → 34) as one of the dialect's most distinctive features,
in contrast to most other Teochew varieties where it stays flat at 33. The old
value of 23 looks like a transcription slip against tone 5's value, which sits
right next to it in the same table. Rules 5, 6 and 7 were off for a related
reason: Zhang's table shows tones 5, 6 and 7 converging on nearly the same low
pitch in sandhi position (23, 21~22, 23 respectively) rather than the single flat
"11, 31, 11" this dataset had recorded.

**Residual uncertainty, deliberately not blocking resolution.** Two things Zhang's
table records that this flatter table cannot: (1) tones 2, 3 and the checked tone
4 each have a *second* sandhi contour used before a high-onset following tone
(35/53/54, vs. 24/42/43 elsewhere), which would require the engine to derive
sandhi per-syllable-pair rather than per-syllable to model — the `contour`
values stored for these three rules are the before-high-onset-tone variant, not
the elsewhere one; (2) rule 7's corrected
contour (23) comes from Zhang's own citation value for tone 7 (21~22), which
differs from this dataset's citation value of 11 for the same tone — see §4.
Neither affects the `to` mapping, which is what the engine actually uses to
respell Peng'im.

**Known scope limitation:** the engine treats a whole headword as one tone group.
That is correct for compounds, but real phrase-level sandhi domains are set by
syntax, and a long phrase regroups. Anything beyond a compound should be treated
as approximate.

## 4. Citation tone contours  ·  `varieties/*.yaml` → `tones`

Tone 2 is given as 53 for Chaozhou and 52 for Shantou; tone 3 as 213. Both are
reported with variation in the literature. These affect only the numeric tone
letters in derived IPA, not the tone *numbers*, so an error here is cosmetic
rather than structural.

**Tone 7 (陽去) is a further case, found while resolving §3.** This dataset
records tone 7's citation contour as `11` (low level). Zhang (2021), the source
behind §3's sandhi corrections, instead gives `21 ~ 22` (low falling to low
level) for the same tone in Chaozhou and Chenghai specifically. Both describe a
low pitch, so this is very likely the same cosmetic symbol-choice variation as
tones 2 and 3 above, not a different phoneme. Left as `11` pending a source
check, same reasoning as the rest of this section.

## 5. The `r` initial  ·  `varieties/chaozhou.yaml`

**Encoded as:** /dz/, `confidence: medium`.

Realised [dz] ~ [z] ~ [l] depending on speaker, register and age, with younger
speakers reported to merge it toward /l/. A single IPA value cannot capture
this. If the variation matters for your use, the honest fix is to model it as an
alternation rather than pick one.

Citation recorded: `sources: [wikipedia, learnteochew]`. Both corroborate [dz]
relaxing to [z] for younger/overseas speakers; neither attests the further
merger to /l/, which remains uncited in the `note`.

## 6. The `oi` and `ou` nuclei  ·  `varieties/chaozhou.yaml`

Encoded as [oi] and [ou] at `confidence: medium`. Some descriptions transcribe
these with different second elements. Low impact, but easy to confirm.

Citation recorded: `sources: [wikipedia, learnteochew]`. Both give the plain
/oi/ and /ou/ values with no competing transcription found — corroborating,
not yet a resolution of whichever "some descriptions" this section refers to.

## 7. Assigning tone 6 (陽上) vs tone 7 (陽去)  ·  `entries/*.yaml`

Not a phonology-table question — a **data-entry rule**, recorded here because
getting it wrong is invisible. The seed lexicon was originally written with tone
7 entirely absent: every 陽去 syllable had been assigned tone 6. Tone feeds IPA,
POJ *and* sandhi derivation, so one wrong tone silently corrupts three derived
fields.

Teochew keeps 陽上 and 陽去 apart. Assign by Middle Chinese category:

| MC tone | MC initial | Teochew | Example |
|---------|-----------|---------|---------|
| 上聲 | voiced (全濁 or 次濁) | **6** 陽上 | 五 `ngou6`, 有 `u6`, 坐 `zo6`, 卵 `nng6`, 是 `si6` |
| 去聲 | voiced (全濁 or 次濁) | **7** 陽去 | 大 `dua7`, 飯 `bng7`, 賣 `bhoi7`, 話 `uê7`, 字 `ri7` |

**A Hokkien cognate cannot settle this.** Hokkien merged 陽上 into 陽去 and writes
a macron for both, so Hokkien 卵 nn̄g (陽上 → Teochew `nng6`) and 飯 pn̄g (陽去 →
Teochew `bng7`) look identical there and differ here. Hokkien tells you the
syllable is 陽上-*or*-陽去; only the MC category tells you which.

**Sandhi cannot settle it either.** The table above sends both 6 and 7 to
surface tone 7, so a non-final syllable gives no evidence. Judge from the
citation form.

Two traps worth naming:

- **訓讀 graphs.** Where a character is borrowed for a word that is not its own
  reading, the tone follows the *spoken* etymon. 二 `no6` is really 兩 (來母 上聲
  → 陽上); the literary 二 `ri7` is 二 itself (日母 去聲 → 陽去). Same headword,
  different tones, because they are different words.
- **Grammaticalised forms.** Negators, interrogatives and reflexives often have
  no regular MC source. Flag them `needs_review` rather than guessing — see the
  table below.

## 8. 訓讀 graphs: does the entry live under the graph or the etymon?  ·  `entries/*.yaml`  ✅ **Resolved 2026-07-30**

**Ruling:** **split.** When a word is conventionally written with a graph that
is not its own character (訓讀) and the spoken word also has its own,
independently-attested character, that word gets its own entry filed under
the etymon — not a second reading nested under the borrowed graph. The
borrowed graph is recorded in a `note` on the etymon's reading, not via
`variants`: that field already means "alternative character writings of the
same word" (`src/schema/entry.ts`), and a 訓讀 graph is not an alternative
writing of the etymon — it is the *only* writing anyone actually uses, and it
belongs to a different character. Overloading `variants` would blur "this
word is occasionally spelled another way" with "this word is always spelled
with someone else's character."

**Applied to 二/兩** (the case §7 names as the trap): 兩 `no6` is now its own
entry (`no6-兩`), the word actually spoken when counting objects. 二
(`ri7-二`) keeps only its own reading, used in compounds and higher numbers.
`register` no longer appears on either entry — colloquial/literary marks two
readings of *one* character, and after the split neither entry has two
readings of one character to distinguish.

**Consequence:** a lookup for 兩 now finds the counting word directly. A
lookup for 二 finds only the literary numeral, which is correct: that entry
does not spell the word meaning "two objects" — the character does, on loan.

**Why 濟 is not split.** `zoi7-濟` (`descriptives.yaml`) is also 訓讀 — 濟's
own reading is 陰去 (tone 3), not the 陽去 the entry records — but it stays as
one entry with an explanatory note. The distinguishing fact is whether a
*displaced etymon with its own ordinary character* exists to file a second
entry under. 兩 does: it's an extremely common character in its own right,
independently attested across Min and Mandarin. Teochew's colloquial "many"
does not have one on record here. The rule turns on whether that second
character exists, not on the mere presence of 訓讀.

## 9. Southern Teochew — `chaoyang.yaml`  ·  `varieties/chaoyang.yaml`  ✅ **Resolved 2026-08-03**

**Ruling:** `chaoyang.yaml` added, a sparse overlay on `chaozhou.yaml` the same
shape as `shantou.yaml`. It stands in for the wider Chaopu subgroup 潮普片
(Chaoyang — incl. Chaonan/Dahao — Puning, Huilai), not just the city of
Chaoyang: pujdict groups the three as one tonal pattern, the "练江腔"/Lianjiang
accent. That grouping is a single-source, medium-confidence claim, not yet
checked against a second source — if Puning or Huilai turn out to diverge,
split them out.

Two differences from Chaozhou are modelled:

- **The `e` → /u/ merger** (`nuclei.e`, `confidence: high`). This is the
  merger §1 removed from `shantou.yaml` for being attached to the wrong
  variety — it belongs here. Corroborated two ways, directly: `pujdict`
  states that Chaoyang speakers don't distinguish 余 from 污 (bare-e words,
  /ɯ/ vs /u/ in Chaozhou); `mogher-region-diff`'s region table gives the same
  `"e"→"u"` correspondence for Chaoyang, Puning and Huilai independently.
  `wikipedia`'s Northern/Southern classification of Chaoyang is consistent
  with this but isn't cited as a third confirmation: that classification is
  itself *defined* by presence/absence of this exact merger, so treating it
  as independent evidence for the merger would be circular. High confidence
  follows the same reasoning as §1's e/ê split: a two-letter, low-ambiguity
  correspondence attested across independent sources — unlike the
  tone-contour digits this section declines to touch (below).
- **`io`/`ioh` non-fronting** (`irregular`, `confidence: medium`). Chaoyang
  patterns with Shantou here, not Chaozhou: `mogher-region-diff`'s table gives
  the same unfronted correspondence for all three Southern varieties, so this
  overlay copies Shantou's existing `io`/`ioh` override values. Kept at
  `medium`, not `high` — see the caveat below. `iong` is carried at `low`,
  same as Chaozhou's and Shantou's own `iong` entries: no source addresses
  this nasal-coda rime specifically for any variety, so none should outrank
  the others.

**A live example of the risk §3 already flags — partially resolved
2026-08-15 (issue #29).** While scoping this change, an automated fetch of
`mogher-region-diff`'s page produced a natural-language gloss that asserted
"Chaoyang fronts `io` like Chaozhou" in one sentence while quoting the page's
own raw table notation showing the opposite in the next. The raw notation was
trusted, the gloss was not — but this is the same summarizer-garbling failure
mode §3 already names for Chao pitch digits, just showing up on a rime
correspondence instead of a tone contour.

Issue #29 asked for a direct, non-summarized read of the raw table to settle
which read was right. That re-check found all four of mogher's regional
comparison tables (Shantou, Chaoyang, Puning, Huilai vs. Chaozhou)
independently give the identical "-iê | -io" / "-iêh | -ioh" row — the raw
notation's reading is confirmed, the original gloss was simply wrong. That
specific narrative-vs-table risk is resolved. What's *not* resolved: issue
#29 also asked for a second independent source before raising confidence to
`high`, and a search (pujdict's doc pages, learnteochew.com, zh.wikipedia's
潮州话音系学 article) didn't find one — see the `io`/`ioh` notes in
`chaoyang.yaml` for what was checked. The mappings above therefore
intentionally stay at `medium`: single-sourced, but no longer for the
original "which reading do we even trust" reason.

**Deliberately not modelled, and why:**

- **Tone contours.** `chaoyang.yaml` carries no `tones:` block, so Chaoyang
  inherits Chaozhou's citation contours unchanged. The strongest available
  source — Zhang (2021)'s dedicated "Tonal Changes in the Chaoyang Area"
  chapter — is paywalled, and two independent automated fetches of the
  Wikipedia/pujdict tone tables already disagreed on the digits before this
  section reproduced the same class of unreliability (above) on a simpler
  correspondence. Chao pitch digits are exactly the detail §3 says not to
  trust without a direct, non-summarized read of the source's raw markup.
- **The tone 3/6 merger reported for 新派 (younger-generation) speech.**
  `pujdict` states that newer Chaoyang speech merges citation tones 3 and 6
  (though sandhi still distinguishes them), attributed explicitly to younger
  speakers, with the implication that older speech keeps them apart. Not
  modelled, matching this dataset's existing preference for the
  conservative/older system — the same baseline `chaozhou.yaml` itself uses.
- **A Chaoyang-specific sandhi table.** No rule-by-rule source was found —
  only an abstract stating the system is "obviously different" from other
  Chaoshan varieties, with no numbers. Chaoyang readings fall back to
  `sandhi/chaozhou.yaml` via `sandhiFor()`'s existing per-variety-with-fallback
  lookup (`src/build/enrich.ts`) — the same behaviour Shantou already has
  today, not a new gap introduced here. `src/validate/index.ts`'s
  `needs_review` check was generalised to loop over every sandhi table present
  (`listSandhiTables()`) rather than hardcoding `chaozhou`, so a future
  `sandhi/chaoyang.yaml` would get the same gate automatically.

**Test words:** 汝/你 `le2` (bare `e`, contrasts all three varieties — see
§1's test list) and 潮 `dio5` (the `io` rime, contrasts Chaoyang/Shantou
against Chaozhou). Both pinned in `tests/derive.test.ts`; the `dio5 ziu1`
headword's three readings are pinned in `tests/dataset.test.ts`.

## 10. The syllable inventory — `wordlists/syllable-inventory.yaml`  ·  issue #30

> Recorded as [ADR-0010](../../docs/adrs/adr-0010.md).

**What this is.** `npm run inventory` enumerates every syllable
`pengim.yaml`'s grammar allows and cross-checks each one against
`data/entries/` (per variety) and an external chart (learnteochew.com). It
does **not** re-derive the grammar's own ambiguity rules a second time:
candidate strings are generated by simple template concatenation over
`pengim.yaml`'s raw tables, then fed through the real `parseSyllable` (via
`tryParsePengim`) — the same parser the rest of the codebase already trusts.
Anything that fails to parse is discarded; a kept syllable's fields always
come from the parser's return value, not the generator's loop variables. This
was validated directly rather than assumed: the generator currently produces
25,056 legal syllables, exactly the order of magnitude predicted by hand from
the raw table sizes before any code was written.

**The over-generation is intentional, not a bug.** Most of those 25,056
syllables are combinatorially legal but not real Teochew — Sinitic
syllabaries have systematic initial×rime gaps no grammar-level rule predicts.
The inventory's job is to flag this, not hide it: every syllable's `varieties`
map records `attested`/`unattested` per variety rather than filtering
unattested forms out.

**Scoped to learnteochew, `pujdict` deferred.** The issue names both as
candidate external charts; acceptance only requires "at least one." Chosen:
`learnteochew`, because its Consonants/Finals/Tones tables carry an explicit
"Peng'im" column — a direct notation match, needing no translation layer. Per
`sources.yaml`'s existing note, `pujdict`'s own romanization is not quite
Peng'im (it transliterates the Chaoyang `e`→/u/ merger with the letter "o"),
which would need a translation step this pass didn't attempt. Left as a
follow-up, not attempted here.

**The cross-check is at rime, not full-syllable, granularity.** No published
chart — including learnteochew's — enumerates full initial+final+tone
syllables; that combination is exactly what this generator computes and
nobody else publishes. What learnteochew's Finals table publishes is legal
*rimes* (`medial? nucleus nasalisation? coda?`, `rimeOf()` in
`src/phonology/inventory.ts`), matching `pengim.yaml`'s own `final :=` grammar
comment. So `external.learnteochew` is set per syllable by checking whether
its rime, not the whole syllable, appears in the scraped Finals column.
Checked directly against the live page (not just a summarized read, learning
from §3/§9's summarizer-garbling lesson): all 79 of learnteochew's listed
finals matched a generated rime with zero mismatches, which is what gives
this cross-check its confidence despite the coarser granularity.

**Only `readings[].pengim` counts as attestation**, not
`senses[].examples[].pengim` — `exampleSchema` carries no `variety` field, so
an example's variety would have to be guessed. `readingSchema` does carry
`variety` (defaulting to `chaozhou`), so readings are the precise reading of
the issue's "attested readings in `data/entries/`."

**Attestation also covers tone-sandhi surface forms (issue #48, per §14's
ruling).** For every multi-syllable reading, `buildSandhiAttestationIndex`
(`src/phonology/inventory.ts`) runs the same `applySandhiToSyllables` that
already backs `EnrichedReading.sandhi` in `src/build/enrich.ts` — via a
`createSandhiResolver` now shared between both call sites, not
reimplemented — and indexes every non-final syllable's sandhi surface (e.g.
`dio7`, the sandhi surface of 潮州's `dio5 ziu1`) the same way a citation
form is indexed. Each `varieties[v]` entry gained a parallel
`sandhi_attested_entries` field alongside `attested_entries`; `status` is
`attested` if either is non-empty. The final syllable of a reading is never
sandhi-shifted, so it stays covered only by the existing citation index, not
duplicated here. Sandhi tables only exist for `chaozhou` today
(`data/phonology/sandhi/`), so all three varieties' sandhi attestation
currently resolves through the same fallback table `enrich.ts` already uses
for the same reason — not a new caveat.

**A sandhi surface form is expected to already be a legal generated
syllable, and this was confirmed rather than assumed.** Every sandhi rule
maps tones within the same checked/unchecked coda class (1→1, 2→6, 3→2,
4→8, 5→7, 6→7, 7→7, 8→4 — the two checked tones, 4 and 8, only ever map to
each other), and `generateSyllables()` already brute-forces every tone legal
for a given coda shape. So folding sandhi attestation in should only change
which of the existing 25,056 syllables are marked attested, not the total
count — regenerating after this change left the count at exactly 25,056,
confirming it. `buildSyllableInventory` still has a defensive fallback that
synthesizes a new item via `parseSyllable` for any sandhi surface not
already in the generated set, in case a future sandhi table ever crosses
that boundary, but it is a no-op today.

**Chaozhou: 358/25,056 attested (336 via citation forms, 22 more via
sandhi-only attestation). Shantou and Chaoyang: 3/25,056 each (2 via
citation forms, 1 more via sandhi-only attestation).** Not a generator bug —
only one entry in the whole lexicon (`dio5-ziu1-潮州` in `places.yaml`)
carries an explicit `shantou`/`chaoyang` reading, and it's also the entry
contributing every non-Chaozhou sandhi-only syllable (`dio7`, its own sandhi
surface); the other 625 `pengim:` readings across the lexicon default to
`chaozhou`. The near-empty Shantou/Chaoyang columns are exactly what that
data distribution predicts, restated here so it isn't mistaken for broken
code during review of the generated file. This will fill in naturally as more
entries gain explicit non-Chaozhou readings or more multi-syllable
readings — the file regenerates via `npm run inventory` whenever that
happens, and a stale copy fails `npm run check` (see the drift-check test in
`tests/inventory.test.ts`).

**Not modelled: variety-specific syllable legality.** `pengim.yaml` defines
the orthography once, variety-agnostically — `varieties/*.yaml` model
phonetic *realization* (Peng'im → IPA), not which syllable shapes are legal.
So the generated syllable *set* is identical across all three varieties; only
attestation differs. If a future variety turns out to lack some rime entirely
(not just lack lexicon coverage of it), that would need a new signal this
inventory doesn't currently carry.

## 11. The audio clip schema — `phonology/audio/*.yaml`  ·  issue #31

**Decision: whole-syllable clips, not per-component.** A clip is recorded for
one canonical Peng'im syllable (`dio5`, matching a `syllable-inventory.yaml`
item key exactly), in one variety — never for an isolated initial, medial,
nucleus, coda, or tone. `audioSchema` in `src/schema/phonology.ts` follows the
existing `mapping` shape (`confidence`/`note`/`sources`) as the issue asked,
plus clip-specific fields: `file`, `speaker`, `recorded`, `checksum`.

**Why not component-level.** The issue framed this as a real trade-off:
stitching ~17 initials + 2 medials + 10 nuclei + 5 codas + 8 tones per variety
(order of 40 recordings) is a far smaller burden than recording full
syllables, and would reuse across the whole syllabary. That framing assumed
the alternative was recording all 25,056 legal syllables — but §10 already
established that the inventory's job is to enumerate what's *legal*, not what
needs a recording. Only entries actually in the lexicon do:
**340 (syllable, variety) pairs are attested right now** (all but 4 of them
Chaozhou), not 25,056. Whole-syllable recording burden tracks lexicon growth,
not syllabary size — the premise that made component-level look necessary
doesn't hold at the scale this project is actually at. Weighed against that,
connected speech has coarticulation a stitched clip can't reproduce, and a
syllable — not a bare initial or nucleus — is the smallest unit a speaker
actually produces in isolation. If the lexicon someday approaches a large
fraction of the full syllabary, this trade-off is worth revisiting; nothing
here forecloses adding component-level clips later as an additive, separately
designed feature.

**Keyed like the inventory, not like a variety file.** `varietySchema`'s
`initials`/`medials`/`nuclei`/`codas` are keyed by short component strings
because they compose left-to-right into IPA (`src/phonology/ipa.ts`). Audio
clips are keyed by the same whole-syllable string `syllable-inventory.yaml`
already uses (`s.raw` / `formatSyllable(s)` in `src/phonology/syllable.ts`),
since that's the unit being attached to, not composed. `checkAudio`
(`src/validate/index.ts`) checks a clip key against the generated inventory's
legal-syllable set, not against *attestation* — recording ahead of dictionary
coverage is legitimate and shouldn't be blocked by validation.

**No inheritance.** `loadVariety` flattens `varieties/*.yaml` key-by-key from
a parent (Shantou/Chaoyang sparsely overlay Chaozhou) because an unlisted IPA
mapping is a genuine claim ("same as the parent"). Audio doesn't get the same
treatment: `loadAudio` (`src/phonology/load.ts`) reads exactly one variety's
own file, with no fallback. A missing Shantou recording must stay missing,
never silently served from a Chaozhou clip that describes a different accent.

**Licence, not hand-written.** A `mapping`'s `sources` is optional evidentiary
citation for a `confidence` claim. A clip's `sources` is required (`min(1)`)
and is its actual provenance — the same "derive the licence, don't
hand-write it" rule `src/data/licence.ts` already applies to entries applies
here too, so `audioClip` carries no separate `licence:` field.

**Wiring.** `src/build/enrich.ts` gains `EnrichedReading.audio`: one entry per
syllable in the reading (parallel to the existing `syllable_count`), `null`
where no clip exists. Unlike `ipa`/`poj`, there is no compositional fallback —
a syllable either has a recording or it doesn't, so `deriveReadingAudio` is a
plain lookup, not a derivation with a confidence-weighted default. Extracted
as a pure function (takes an already-loaded `Audio | null`, does no I/O
itself) specifically so it's unit-testable without needing real audio files,
which don't exist yet — that's issue #36.

**`dist/schema.json` scope, left alone.** The issue's acceptance list asks for
`audioSchema` to be reflected in `dist/schema.json`. As it stands,
`npm run schema` / `src/cli/emit-schema.ts` only emit `entryFileSchema` (the
`data/entries/*.yaml` format) — `varietySchema`, `sandhiSchema`, and
`syllableInventorySchema` were never added to it either, including when §10
added the last of those. Broadening what gets emitted is a real, independent
change to a generated artifact other tooling may already read; making it
silently as a side effect of adding one more phonology schema didn't seem
right. Left as-is here, following the existing precedent, with this noted so
it isn't mistaken for an oversight.

## 12. Audio asset hosting: GitHub Releases + manifest  ·  `phonology/audio/*.yaml`  ·  issue #32

> Recorded as [ADR-0014](../../docs/adrs/adr-0014.md).

**Decision: external object storage, not git.** Clip bytes are hosted as **GitHub Release
assets**; only a YAML manifest (URL + checksum + licence) is committed to `data/`. A clip's
bytes never enter this repo's git history, and no Git LFS store is used either.

**Why not plain git.** Every clone would grow forever as clips are added or re-recorded, and
binary diffs are opaque. This is genuinely the repo's first binary-asset decision — zero binary
assets exist anywhere in `data/` today, and `dist/` is gitignored build output, not a committed
precedent to extend.

**Why not Git LFS.** LFS keeps a clone shallow, but it adds a real dependency — LFS
quota/bandwidth, and every contributor needs the `git-lfs` binary installed — that nothing else
in this project currently requires. Rejected in favour of a zero-new-dependency option.

**Why external storage + manifest, generally.** Ties directly to this README's "data-first,
hand-editable YAML" principle: every git-tracked file in `data/` stays plain text and diffable,
audio included. The explicit trade-off accepted: the dataset is no longer fully self-contained (a
consumer needs network access to actually fetch a clip), and someone has to own hosting
long-term.

**Why GitHub Releases specifically.** Zero new infrastructure or accounts — it reuses this
repo's existing GitHub hosting. Assets are versioned by release tag, free at this scale, and
human-browsable for anyone spot-checking an upload by hand. Contrast with a cloud bucket
(S3/R2/GCS): those would need a new account, credentials, and a billing relationship this project
doesn't otherwise have.

**How the schema embodies it.** `audioClip.url` (`src/schema/phonology.ts`) is a full GitHub
Release asset download URL (`.../releases/download/<tag>/<asset>`, regex-constrained, and
deliberately not the floating `/releases/latest/download/...` alias — a stored reference must be
pinned to a tag so it can't silently start pointing at different bytes later). It replaces §11's
provisional `file` field (a bare filename with an implicit local-directory convention), which
`audioClip`'s own issue #31 design left for this issue to settle. `checksum` is promoted from
optional to required: with the clip hosted externally there is no git-tracked local copy to
compare against, so it becomes the only integrity check available. `sources` (already required)
is unchanged and continues to derive `licence` the same way it always has. Together, `url` +
`checksum` + `sources` are exactly the "URL + checksum + licence" manifest the issue asked for.

A full URL is stored per clip rather than a bare filename plus a reconstructed base-URL
convention. At this project's scale (see below) the repetition cost is a few hundred KB of plain,
diffable text — nowhere near the binary-bloat problem this issue exists to prevent — while a full
URL is self-describing without also reading `src/paths.ts` or this file, and lets each clip's
hosting move independently (e.g. one variety re-recorded under a new release tag while others
stay put). No separate bare-filename field is kept alongside `url` either: a decoupled cache key
isn't useful until something wants one, which is issue #35's territory, not this one's — and this
schema already avoids storing derivable/duplicated data (see §11: no separate `licence:` field on
`audioClip`, for the same reason).

**Scale validation.** §10/§11 established 340 (syllable, variety) pairs attested today (336
Chaozhou, 2 each Shantou/Chaoyang), with a low-thousands ceiling if #34 later adds tone-sandhi
forms — see §14: it does. Each clip is a short single-syllable recording — plausibly tens of KB as opus — trivially
within GitHub's per-asset size limit by orders of magnitude. Caveat, stated as a caveat rather
than a claim: no documented cap on assets-per-release or total per-repo Releases storage was
confirmed while writing this. Given the file sizes involved this is assessed as low risk, and
splitting across multiple releases (already the plan — see below) is a trivial mitigation if it
ever becomes one. Worth confirming empirically once #36 starts uploading, not worth blocking on
now.

**Naming convention (non-binding — refined as needed by #35/#36).** One release per variety
(e.g. tag `audio-chaozhou`). GitHub allows uploading additional assets to an already-published
release, so no new tag is needed per recording batch. Asset filenames should stay plain
ASCII/hyphenated, no spaces, to avoid percent-encoding noise in stored URLs.

**Out of scope, explicitly.** Full validator/build remote-resolution wiring — actually fetching a
clip, caching it, verifying a downloaded file's bytes against `checksum`, and surfacing a
playable reference through `lookup` — is issue #35's job; `checkAudio`
(`src/validate/index.ts`) no longer performs any existence check on `clip.url` (it dropped the
local-directory check §11 shipped, since that directory no longer exists), and deliberately
gains no replacement here. Audio-specific licensing (`LICENSE-DATA-AUDIO-*`, speaker consent) is
issue #33's job. Actual recording and upload is issue #36's job. `dist/schema.json` emission
remains out of scope per §11's own note — unchanged by this decision.

## 13. Audio licensing and speaker consent · issue #33

> Recorded as [ADR-0015](../../docs/adrs/adr-0015.md).

**Decision: CC-BY-4.0, via a new `teochew-dictionary-audio` source — no new
`LICENSE-DATA-AUDIO-*` file.** `data/sources.yaml` gains a `kind: import`
entry, `teochew-dictionary-audio`, licensed CC-BY-4.0, that every original
recording's `sources` cites. Because CC-BY-4.0 is already `BASE_LICENCE` in
`src/data/licence.ts`, this needs no new `LICENCE_CLASS` entry either — the
licence-resolution machinery §11 already wired into `audioClip.sources`
handles it unchanged. `LICENSE-DATA-CC-BY-4.0` is extended (a header
paragraph, not new text) to say it now also covers audio clips, rather than
adding a parallel file whose legal text would be identical.

**Why not CC0.** CC0 was the other option this issue's proposal raised. It
was rejected: every other data category in this project requires
attribution, even permissive ones distinct from the base (`unihan`'s
Unicode-DFS-2016 still owes a notice) — CC0 would make audio the one
category with no attribution obligation at all, for no offsetting benefit.
CC-BY-4.0 also gives a volunteer speaker formal credit, which matters more
for a recorded voice than for an imported dictionary fact.

**Per-clip attribution is `speaker`, not `attributions`.** `resolveLicence`
only adds a source to an entry's or clip's `attributions` array when that
source's licence differs from `BASE_LICENCE` (see `src/data/licence.ts`).
Every clip cites `teochew-dictionary-audio`, which *is* `BASE_LICENCE`, so
`attributions` stays empty for audio the way it does for an entry that only
cites `seed`. That's not a gap: `audioClip.speaker` (§11) already carries
per-clip attribution, pseudonymous by design, independent of the
`sources.yaml`-level mechanism that exists to handle *distinct* licences.

**Speaker consent is a separate document, deliberately.** A licence string
answers what governs *redistributing* a recording once it exists; it says
nothing about whether the speaker agreed to make and release it in the first
place. That's a personal-data/consent question this dataset has never had to
model before — pronunciations and glosses don't have a person's voice
attached to them. [`AUDIO-CONSENT.md`](../../AUDIO-CONSENT.md) (repo root,
alongside the `LICENSE*` files) documents that process: what a speaker is
agreeing to, that they're credited pseudonymously, and that CC-BY-4.0's
irrevocability means a published clip can't be un-released even if the
speaker later withdraws from recording further clips.

**Future externally-sourced audio.** If audio is ever imported from an
existing corpus instead of newly recorded — Wiktionary's audio files are
licensed separately from its text; Forvo's terms are considerably more
restrictive — it needs its own `sources.yaml` id with its own `kind`/licence,
never folded into `teochew-dictionary-audio`, mirroring how `wiktionary` and
`cedict` stay distinct today despite both being dictionary imports. Forvo
specifically is flagged as likely incompatible with `kind: import` outright,
pending an actual read of its terms if this is ever pursued — nothing here
commits to importing from either.

**Wiring: a clip's licence is no longer discarded.** `checkAudio` (§11) has
always resolved a clip's `sources` to confirm it *can* back a licence, but
until now nothing downstream read the result — `AudioReference` in
`src/build/enrich.ts` exposed only `url`/`confidence`/`syllable`, unlike
`EnrichedEntry`, which exposes `licence`/`attributions` specifically so a
consumer can filter to a permissive subset (README § Licensing). Closed the
same way: `deriveReadingAudio` now takes the loaded `sources` map and calls
`resolveLicence` per clip, so `AudioReference.licence`/`.attributions` ship
in `dist/dict.json` alongside `url`/`confidence`/`syllable` — not every
field a clip carries; `speaker`/`note`/`recorded`/`checksum` stay
source-data-only. Trusted to resolve, the same way entry licence resolution
is: `build()` refuses to run while `validate()` reports an unresolvable
licence.

**Out of scope, still.** Remote fetch/checksum verification of `clip.url`
stays issue #35's job (§12). Actual recording and upload — the first real
`data/phonology/audio/*.yaml` file — stays issue #36's job; this section
settles what licence and consent process that recording happens under, not
who performs it.

## 14. Tone-sandhi audio scope · issue #34  ✅ **Resolved 2026-08-15**

**Ruling:** v1 audio scope includes tone-sandhi-shifted surface forms
alongside citation forms — not citation-only. The README's own `潮州`
example is the concrete case this settles: both `dio5 ziu1` (citation) and
`dio7 ziu1` (sandhi) are in scope for recording, not just the former.

**Why not citation-only.** Sandhi is pervasive — `sandhi/chaozhou.yaml`'s own
header states every syllable except a tone group's last surfaces with a
changed tone. Most spoken Teochew is therefore sandhi forms, not citation
forms. A citation-only recording set would teach the minority pronunciation
for every non-final syllable in any multi-syllable headword, which is most of
the lexicon. That gap is exactly what #34 was raised to catch before #36
recorded the wrong form and had to redo it.

**Why the residual sandhi-modelling gaps don't block this.** §3 leaves two
things unmodelled, and they cut differently. The first — the engine derives
sandhi per-syllable rather than per-syllable-pair, so it can't produce tones
2/3/4's second contour variant used before a high-onset following tone — is
confined to `contour`, exposed only as descriptive metadata (the Chao pitch
shape), never consumed to generate a recordable spelling. It does not touch
the `to` field — the tone NUMBER a citation tone surfaces as, which is what
actually drives Peng'im respelling and therefore what a speaker would be
recording — and `to` was independently corroborated by three sources and
fully resolved in §3. The second — the engine treats a whole headword as one
tone group — is not contour-only: it doesn't change the `to` table, but it
does decide *which* syllables the table is applied to, so a headword that
really spans two tone groups would have its internal group-final syllable
shifted when real speech keeps it citation. Per §3 that approximation is
correct for compounds and only breaks down beyond them, and headwords are
overwhelmingly compounds; a mis-shifted syllable also still yields a legal
sandhi form of that syllable, so it cannot smuggle an out-of-scope form into
the inventory. So the first gap is a caveat on the pitch *description*, the
second a bounded caveat on which positions shift — neither a blocker on
knowing which tone to record.

**Why this isn't new modelling risk.** `src/phonology/sandhi.ts`'s
`applySandhiToSyllables` already computes exactly the surface forms this
decision puts in scope, per headword, deterministically from the `to` table.
It is not new code written to justify this decision — it already backs
`EnrichedReading.sandhi` in `src/build/enrich.ts`, which is what produces the
`"sandhi": "dio7 ziu1"` field in every build today. Extending the audio
inventory to cover sandhi forms is reuse of an already-shipped, already-tested
derivation, not a new phonological claim.

**Why the recording burden stays bounded.** §11 already established that
recording burden tracks lexicon growth, not syllabary size: only 340 of the
generated inventory's 25,056 legal syllables are attested today. The same
logic applies here — sandhi forms are only needed for the non-final syllables
of readings actually in the lexicon, not the full syllable × 8-tone
combinatorial space. §12 priced this in ahead of time as "a low-thousands
ceiling," which this ruling confirms is the right order of magnitude to plan
storage against.

**Consequence.** #30's generator does not yet fold sandhi forms in — it
remains citation-tone-only today (confirmed: no `sandhi` reference in
`src/phonology/inventory.ts` or `src/cli/inventory.ts`). Under this ruling
that generator is incomplete, not merely conservative. The fold-in is tracked
as its own issue, #48, rather than done as part of #34: the representation
question (new inventory entries? a sibling artifact?) deserves its own design
pass rather than being decided as a side effect of a scope ruling. #36
(recording) accordingly now depends on #48 landing, not only on this
decision — recording still cannot start against a complete inventory until
#48 resolves.

**Update:** #48 has since landed — see §10, which now documents
`sandhi_attested_entries` and the folded-in counts.

## 15. `dist/schema.json` scope — phonology-side schemas · issue #39  ✅ **Resolved 2026-08-16**

> Recorded as [ADR-0004](../../docs/adrs/adr-0004.md).

**Decision: broadened, one file per schema — not a merged bag.** `npm run
schema` / `src/build/index.ts` now emit a JSON Schema for every schema in
`src/schema/`, not just `entryFileSchema`: `pengim-schema.json`,
`poj-schema.json`, `variety-schema.json`, `sandhi-schema.json`,
`external-chart-schema.json`, `audio-schema.json`, and
`syllable-inventory-schema.json` join `schema.json` in `dist/`. This
supersedes §11's "left alone" note (§11/§12 stand as-written, historical
record of the state at the time — not edited here).

**Why broadened.** §11 correctly declined to decide this as a side effect of
adding `audioSchema` — it's a real, independent decision about what a
generated artifact promises, and every phonology schema was exactly as
absent as `audioSchema`, including `varietySchema` since #30. Once actually
weighed on its own: the phonology data files are as much a validated part of
this project as the lexicon (`src/schema/phonology.ts`'s own header says so),
and `emit-schema.ts`'s original rationale — "editors and non-TypeScript
consumers can validate ... without running our tooling" — applies to a
contributor hand-authoring a new variety overlay exactly as much as it does
to an entries file. `varietySchema` in particular already models the sparse
Shantou/Chaoyang-overlay-on-Chaozhou shape correctly (every mapping group and
`variety.inherits` are optional), so the generated schema is accurate for
both a reference variety and an overlay, not just the reference case.

**Why one file per schema, not merged.** JSON Schema has no clean way to
express "this file is N unrelated top-level schemas" — a consumer expects to
validate a document against *the* schema at a file's root, not pick a named
sub-schema out of a `$defs` bag. Per-file also means `dist/schema.json` keeps
meaning exactly what it means today (no rename, nothing that already reads
it breaks) and each phonology file's schema is independently diffable —
changing `sandhiSchema` doesn't perturb `audio-schema.json`.

**`pengimSchemeSchema` included.** The issue's own acceptance list named
`varietySchema`, `sandhiSchema`, `pojSchema`, `syllableInventorySchema`,
`externalChartSchema`, and `audioSchema`, but not `pengimSchemeSchema` —
despite it living in the same `phonology.ts` and backing `pengim.yaml`.
Leaving it out here would reproduce the exact "arbitrary partial inclusion"
problem the issue exists to avoid, so it's emitted too
(`pengim-schema.json`).

**The variety enum.** Raised alongside this decision: `reading.variety`
(`src/schema/entry.ts`) is `z.string()` with no static enum — its legal
values are derived at runtime from `listVarieties()`'s directory listing
(`src/phonology/load.ts`), not from any zod type, and checked only by
`src/validate/index.ts`. No amount of broadening `dist/schema.json` — merged
or per-file — would let an external consumer catch an unknown-variety typo
via JSON Schema alone unless the known ids are baked into the generated
artifact directly. Fixed narrowly: `src/schema/emit.ts` injects a live
`enum` (and `default`) into just the `variety` node of the generated entry
schema, via zod-to-json-schema's `override` hook, sourced fresh from
`listVarieties()` on every emission. `readingSchema.variety` itself stays a
plain `z.string().default(DEFAULT_VARIETY)` — deliberately not promoted to a
static `z.enum(...)`, which would couple schema definition to filesystem
state at module-load time and duplicate `validate/index.ts`'s existing,
friendlier runtime check (which names the offending value and lists what's
known) with a second, less informative one. The generated JSON Schema is a
best-effort mirror for external tooling; `validate/index.ts` remains the
actual enforcement point for this project's own data.

**Out of scope, named explicitly (same reason §11 named `dist/schema.json`
itself rather than deciding it silently).** `sourcesFileSchema`
(`src/schema/entry.ts`, backs `data/sources.yaml`) is not one of the
phonology-side schemas this issue asked about and is left unemitted. The
*enriched* output shape — `EnrichedEntry`/`EnrichedReading` from
`src/build/enrich.ts`, i.e. what `dict.json`/`dict.ndjson` actually contain
(`audio`, `ipa_confidence`, `sandhi`, `search_keys`, `licence`, ...) — was
named in the issue as separate, likely-larger work and remains so; unchanged
by this decision.

## 16. Importing Lingua Libre/Commons audio — schema, hosting, consent · issue #106

> Recorded as [ADR-0015](../../docs/adrs/adr-0015.md).

**Background.** #106 found that Wikimedia Commons hosts ~2,138 CC-BY-SA-4.0
Teochew pronunciation recordings via the Lingua Libre project
(`Category:Teochew_pronunciation`), filename pattern
`LL-Q36759-<uploader>-<transcription>.wav`. Most are whole-word/phrase
recordings (e.g. `bhi7 jui2`), not the single-syllable unit `audioClip`
(§11) is keyed to — a real schema gap, not something a `sources.yaml` row
alone can paper over.

**Decision: a new `wordClips` map, not a repurposed `clips`.**
`audioSchema` (`src/schema/phonology.ts`) gains `wordClips:
z.record(audioClip).optional()`, keyed by a reading's full space-joined
pengim string (e.g. `bhi7 jui2`) instead of one syllable, reusing
`audioClip`'s shape verbatim — no new clip-level fields. Same reasoning as
§11, cutting the same direction: a word-level recording has real
connected-speech coarticulation/sandhi that a per-syllable clip can't
represent, so a genuine word recording is kept intact rather than sliced or
folded into `clips`. No inheritance, no compositional fallback, exact-string
keying — the same rules `clips` already follows: a reading either has a
word clip or it doesn't, and a citation-form key does not satisfy a
sandhi-surface reading (§14) or vice versa.

**Rejected: single-syllable-only import.** Discarding every multi-syllable
transcription would need no schema change, but throws away most of the
corpus for no linguistic reason — a word-level recording is *better*
evidence than a syllable clip, not worse. **Rejected: deferring the schema
call.** Staging proposals without deciding where multi-syllable clips
eventually live would just move this decision to the merge step without
resolving anything now, and the issue's own open questions asked for an
actual call, not a deferral.

**Wiring.** `src/build/enrich.ts` gains `deriveReadingWordAudio` (parallel
to `deriveReadingAudio`) and `EnrichedReading.wordAudio: AudioReference |
null`. `AudioReference.syllable` is renamed to `.key` throughout (`enrich.ts`,
`web/src/types/dict.ts`, `src/cli/lookup.ts`) — a field named `syllable`
holding a multi-syllable string would be actively misleading. `checkAudio`
(`src/validate/index.ts`) gains a parallel loop over `wordClips`: the key
must itself parse as Peng'im (via `tryParsePengim`, the same parser
`extractPengimPrefix` below trusts), must be more than one syllable (a
single-syllable key belongs in `clips`, which already has an unambiguous
home for it), and every syllable it parses to must be legal per the same
generated inventory `clips` checks against.

**New `lingualibre` source, `kind: import`, `licence: CC-BY-SA-4.0`** in
`data/sources.yaml`, modeled directly on `wiktionary`. No new
`LICENSE-DATA-*` file — CC-BY-SA-4.0 already has one (shared with
`wiktionary`/`cedict`) and is already classified `share-alike` in
`src/data/licence.ts`.

**Decision: re-host on this project's own GitHub Releases, not link to
Commons directly.** Keeps `audioClip.url`'s existing GitHub-Releases-only
regex (§12) and the `npm run audio:verify` checksum pipeline as the single
code path for every clip regardless of origin — no schema loosening to
accept a second URL shape, no new "is this clip's host still up" failure
mode to reason about. Tradeoff accepted: bytes get downloaded and
re-uploaded rather than referenced in place. CC-BY-SA-4.0 explicitly permits
this (share-alike requires attribution + same-licence redistribution, not
"hosted at the original URL"). `src/importers/lingualibre-rehost.ts`
(`npm run rehost:lingualibre`) does the download/checksum/`gh release
upload` mechanics per clip, uploading to a new `audio-lingualibre` release
tag — deliberately per-clip, not run over the whole staged corpus by this
change: re-hosting is only worth the effort once a human has decided a
clip is worth keeping (right variety/accent, transcription matches a real
entry), which is the deferred merge step below.

**Consent differs from `AUDIO-CONSENT.md` — scoped explicitly, not left
implicit.** That file's pseudonym/opt-out process governs clips recorded
*by this project*. A Lingua Libre clip's consent already happened through
Commons' own upload flow: `speaker` on an imported clip holds the
contributor's real Commons/Wikimedia username, not a project-assigned
pseudonym, and this project can only stop importing more from a given
contributor, never affect what's already public on Commons. `AUDIO-
CONSENT.md` gained a short addendum saying so, and the `lingualibre`
`sources.yaml` entry's own note repeats it — a future reader shouldn't
assume every clip's `speaker` field went through this file's process.

**Importer stays mechanical; classification is out of scope.**
`src/importers/lingualibre.ts` (`npm run import -- lingualibre`) enumerates
the Commons category (`list=categorymembers` — an exact enumeration, unlike
Wiktionary's CirrusSearch-bounded search, so there's no wordlist/cache split
needed, one fetch pass covers the whole corpus), batch-fetches `imageinfo`
per file, and recovers a Peng'im transcription from the filename. The
uploader segment is taken from `imageinfo.user` (authoritative) rather than
split from the filename's first hyphen, since a username can itself contain
a hyphen. `extractPengimPrefix` finds the longest whitespace-token prefix
that parses via `tryParsePengim`, rather than guessing a character class —
real transcriptions carry trailing hanzi/gloss text (e.g. the issue's own
`bhi7 jui2 沬水 -nager (sous l'eau)-` example), and in testing against that
exact example, `jui2` itself turned out to have no recognised nucleus in
this project's Peng'im scheme, so only `bhi7` resolves — a genuine
scheme/corpus mismatch surfaced by building this, not a parser bug, and
exactly the kind of thing a human reviewing staged proposals needs to see
rather than have silently discarded. The importer does not guess
variety (Chaozhou/Shantou/Chaoyang) or judge accent fit — Commons'
`extmetadata.ImageDescription`, when present (e.g. "Puning-Chaoyang mixed
accent"), is carried through as `accentNote` for a human to read at merge
time, unclassified. A licence-metadata mismatch is flagged, not silently
dropped — the proposal still stages, so a reviewer sees exactly what's
questionable about it rather than losing it from the corpus count entirely.

**New staging shape, not the entry-shaped `Proposal`.** `Proposal`/
`ProposedReading`/`ProposedSense` (`src/importers/types.ts`) model a
proposed dictionary entry and have no room for a clip's fields (Commons
URL, speaker, accent note, syllable count). `src/importers/audio-types.ts`
adds a parallel `AudioClipProposal`/`AudioImportResult`, and
`src/importers/audio-staging.ts` a parallel `writeAudioStaging`/
`readAudioStaging`, targeting the same `data/staging/<source>.yaml`
location/filename convention `writeStaging` uses but a different internal
shape — the header comment `writeAudioStaging` writes says so explicitly,
so a reviewer isn't confused by the difference from `data/staging/
wiktionary.yaml`.

**Explicitly out of scope, this change.** Running the importer against the
full corpus and merging results into `data/phonology/audio/*.yaml` — the
per-clip accent/variety judgment call #106 itself flags as needing a
human — is a separate follow-on, mirroring how #68 (hand-merging staged
Wiktionary proposals) stayed separate from the Wiktionary importer itself.
Bulk re-hosting is likewise not run here; the rehost CLI is built but
invoked per-clip, at merge time. No web UI renders `wordAudio` — same as
per-syllable `audio`, already out of scope for v1 (`web/src/components/
EntryDetail.tsx`). *(That last point no longer holds: issue #114 shipped
playback for both `audio` and `wordAudio` in `EntryDetail`; the display and
clip-licence decisions are recorded in `web/README.md` § Architecture. The
data side is unchanged — there is still no clip to play.)*

**Update 2026-08-23: the merge step exists now, and the corpus needed a
licence-classification fix first.** `npm run merge:lingualibre --
<index-or-commonsTitle> --variety=<id>` (`src/importers/lingualibre-merge.ts`)
re-hosts a staged proposal and writes it straight into
`data/phonology/audio/<variety>.yaml`, replacing the old hand-copy step —
still per-clip and human-driven, `--variety` has no default, and an existing
key is left alone unless `--force` is passed.

Running the importer for real against the live Commons category staged 164
proposals from the 2,138 files it found (127 single-syllable, 37
multi-syllable). Cross-referencing staged pengim keys against the lexicon's
readings found 70 distinct readings with at least one candidate clip (10 of
them word-level) — but only 25 of those had a candidate whose own Commons
`imageinfo` licence cleanly matched the category's declared CC-BY-SA-4.0
default. The rest reported `CC0` or `CC-BY-4.0` instead (`normaliseLicence` in
`lingualibre.ts` only canonicalises the expected value, so these staged as
the raw Commons string and picked up the importer's existing licence-mismatch
flag). Both are more permissive than CC-BY-SA-4.0, not less, so nothing here
suggests miscredited source material — just that upload-time metadata for
this corpus is genuinely mixed, not uniformly share-alike.

**Decision: a merged clip cites its own reported licence, not a blanket
`lingualibre` id.** Two new `data/sources.yaml` entries, `lingualibre-ccby4`
(CC-BY-4.0) and `lingualibre-cc0` (CC0), alongside the existing `lingualibre`
(CC-BY-SA-4.0) — same provenance/consent story, split only on licence.
`licenceSourceId` (`lingualibre-merge.ts`) maps a proposal's raw Commons
licence string to the right id and refuses to merge (throws, not a silent
default) when it recognises none of the three — the alternative, always
citing `lingualibre` regardless of what Commons actually reports, would
overstate a CC0/CC-BY-4.0 file's share-alike obligation. `CC0` joins
`LICENCE_CLASS` in `src/data/licence.ts` as `permissive` (it needs no
attribution at all, legally, but is credited via the clip's `speaker` field
anyway, the same courtesy already extended to `unihan`), and
[`LICENSE-DATA-CC0`](../../LICENSE-DATA-CC0) — the official CC0 1.0 Universal
legal code, fetched directly from creativecommons.org rather than
reproduced from memory — joins the licence files at the repo root. This
unlocks all 70 candidate readings for merging today, not just the 25 whose
Commons metadata happened to match the category default.

**Duplicate candidates are still a human call, not this tool's.** Several
matched keys have more than one staged candidate (different uploaders, or the
same uploader's retry) — the schema holds one clip per key, so picking which
recording to keep stays exactly the kind of accent/quality judgment §16
already assigns to a human, not something `mergeLinguaLibreClip` decides by
picking the first match.

**Update 2026-08-24 (issue #123): truncation is now flagged, not silent.**
`extractPengimPrefix` itself is unchanged, but `importLinguaLibre` now
re-scans the discarded remainder for whitespace tokens shaped like
`letters+tone-digit` (`findDroppedPengimTokens`) and adds a `flags` entry
when one is found — the same mechanism already used for licence mismatches.
Of the corpus staged before this fix, 80 of 164 proposals were affected (68
single-syllable, 12 multi-syllable); those already-staged entries are not
retroactively corrected by this change — a re-import or hand-fix is a
separate follow-on.

**Update 2026-08-24: the "there is still no clip to play" note above is now
stale.** Issue #128's merge commits landed real clips —
`data/phonology/audio/chaozhou.yaml` currently holds 110 per-syllable clips
and 8 whole-word clips. `EntryDetail`'s players and the "Only entries with
audio" filter (`web/src/search/filters.ts`) now render real content for the
Chaozhou entries those keys resolve to. Coverage is still partial (most
Chaozhou syllables remain unrecorded, and Shantou/Chaoyang have none), so
most entries still resolve every slot to `null` — this isn't "done," just no
longer "nothing."

## 17. Recording clips from the Sounds tab · `web/`, `phonology/audio/*.yaml` · issue #128

> Recorded as [ADR-0017](../../docs/adrs/adr-0017.md).

**Background.** #124 shipped a Sounds tab listing every distinct syllable
attested in the lexicon, but most rows have no clip in
`data/phonology/audio/chaozhou.yaml` yet — filling that gap today means
running the whole `import`/`merge:lingualibre` pipeline against an outside
corpus, which has nothing to offer for a syllable no one has ever uploaded to
Commons. #128 asks for a "record" control right on the Sounds tab so a
contributor at a mic can capture one directly, dev-only (production is a
static GitHub Pages build with no backend to write to).

**Decision: stage for human review, not a direct publish from the browser.**
The alternative — the browser's save action immediately re-hosts to a GitHub
Release and writes into `chaozhou.yaml`, mirroring what `merge:lingualibre`
already does — was rejected even though it satisfies the issue's draft
acceptance criteria more literally (a plain restart alone would surface the
clip). Publishing to a public GitHub Release is a real, externally-visible
action; today it only happens when a human deliberately runs a CLI against
an already-staged, already-reviewed proposal. Routing a browser button
straight to that same effect — with no review step, and gated only by a
client-side checkbox — lowers the bar for publishing in a way the rest of
this pipeline never has. So: the record flow only ever writes to disk and
appends a proposal; publishing stays a separate, human-run merge step, same
shape as the existing Lingua Libre flow. Consequence, noted here so it
doesn't read as an oversight: issue #128's "after a server restart, entries
using that syllable serve the new recording" acceptance criterion is not met
by a restart alone — it also needs `npm run merge:local-recording` first.

**New staging shape, not a repurposed `AudioClipProposal`.**
`src/importers/audio-types.ts`'s `AudioClipProposal` is Commons-shaped
(`commonsTitle`, `commonsUrl`, `licence` recovered from `imageinfo`) and has
no room for a clip that was never fetched from anywhere — it was recorded
straight to a local file. `src/importers/local-recording-types.ts` adds a
parallel `LocalRecordingProposal` (`pengim`, `localPath`, `speaker`,
`recordedDate`, `consentAcknowledged`), staged to a new
`data/staging/teochew-dictionary-audio.yaml` (same directory/one-file-per-
source convention as `data/staging/lingualibre.yaml`) via
`src/importers/local-recording-staging.ts`. Unlike `writeAudioStaging`
(one overwrite per batch import run), this file is built up one proposal at
a time as recordings happen, so its writer appends into the existing
document (`yaml`'s `parseDocument` + mutate) rather than regenerating the
whole file — a human's own edits to already-staged entries (e.g. a review
note) survive a later browser-triggered append instead of being clobbered.

**Recorded bytes are committed, not gitignored.** This project already has a
gitignored scratch convention (`CACHE_DIR`, `.cache/`) for anything
refetchable — but a spoken recording isn't refetchable; losing the file
before it's merged loses the recording itself. `data/staging/recordings/`
holds the raw clip bytes alongside the proposal that references them by
path, so a reviewer (on any machine, via a normal PR diff) can actually listen
to what they're being asked to merge, and nothing depends on the recording
contributor's own machine still having the file later.

**Consent stays exactly the manual process `AUDIO-CONSENT.md` already
describes**, not something this feature automates or verifies — that
document is explicit that consent is tracked outside the repository. The
record flow requires a speaker pseudonym and an explicit "I have obtained
consent" acknowledgement before it will let a proposal be saved, the same
way `mergeLinguaLibreClip` requires `--variety` with no default: not proof
of the right call, just a guardrail against clicking past the requirement
unnoticed. `teochew-dictionary-audio` (`data/sources.yaml:67-84`) already
existed as this feature's eventual source id before this issue was written.

**Merge mechanics reuse `rehostClip`'s shape, not its code path.** A local
recording has no URL to fetch — the bytes are already on disk — so
`src/importers/lingualibre-rehost.ts`'s tmp-file/`gh release upload`/sha256
logic is factored out into a shared `uploadBytesToRelease` helper that both
the existing fetch-from-Commons path and a new
`src/importers/local-recording-rehost.ts` (read-from-disk) call, rather than
duplicating it. `src/importers/local-recording-merge.ts` mirrors
`mergeLinguaLibreClip` otherwise: refuses to overwrite an existing key
without `--force`, builds a clip with `sources: ['teochew-dictionary-audio']`
and `confidence: 'high'` (a direct first-party recording, not scraped
metadata of uncertain fit), validates with `audioSchema.parse`, writes back
with the same comment-preserving `parseDocument`/`setIn` mutation. On
success it deletes the now-redundant staged proposal and local file — once
the bytes live on a Release, the staged copy is only a liability (a second,
driftable copy of the same clip).

## Individual entries flagged `needs_review`

Run `npm run validate` for the current count. As of writing:

| Entry | Question |
|-------|----------|
| 乜 `mih8` | Peng'im spelling and tone both uncertain. The id also records `sim2 mih8` (i.e. 甚乜) against the reading's bare `mih8`, so whether the headword is 乜 or 甚乜 is open too. The id is deliberately left unrenamed: renaming to `mih8-乜` would assert the bare form, which is the very thing in question. |
| 兄 `hian1` | Bare 兄 appears to be largely bound, with 阿兄 the free term of address and reference (cf. Hokkien a-hiaⁿ). Confirm for Teochew specifically, and whether 阿兄 warrants its own entry. |
| 底儂 `di6 nang5` | The usual word for "who"; form and tones need confirming. 底 is 陰上 by MC (端母 上聲), which predicts tone 2 — neither 6 nor 7 is regular. The id also says `diang5` where the reading says `nang5`; `diang5` may in fact be the fused monosyllabic form of the whole word (cf. Hokkien tiâng < tī-lâng), i.e. an alternative reading of 底儂 recorded in the wrong slot. |
| 底時 `di7 si5` | Resolve together with 底儂: the same morpheme 底 is written `di7` here and `di6` in 底儂, and neither is the regular reflex of 端母 上聲. |
| 家己儂 `ga1 gi6 nang5` | 己 is 陰上 by MC (見母 上聲), predicting tone 2, so the recorded 6 is irregular. Non-final position means sandhi hides 6 vs 7; needs the word in isolation. |
| 毋 `m6` | A grammaticalised negator with no regular MC source. The Hokkien cognate m̄ is in the merged 陽上/陽去 class and so cannot distinguish 6 from 7. |
| 米 `bhi2` | Initial may be `bh-` or `b-`; Hokkien has `bí`, which may have influenced the transcription. |
| 熱 `ruah8` | Not a phonological question but a semantic boundary: 熱 is glossed "hot (of weather)" on the assumption that a hot object or liquid takes 燒 instead (cf. Hokkien sio). Confirm the split, and whether 熱 can in fact describe an object. |
| 阿媽 `a1 ma2` | Glossed "grandmother"; confirm it is not also used for "mother" in some families. |
| 歹 `pai2` (prefix sense) | Not a phonological question but an analysis question: is 歹- before a verb (e.g. 歹食 "bad-tasting") a live, productive prefix, or a set of lexicalised adjective compounds like 好食/好看/好聽? Evidence for **productive prefix** (the analysis currently recorded): the parallel Hokkien pattern pháiⁿ-tsia̍h, pháiⁿ-khòaⁿ is fully productive there, and nothing rules out the same for Teochew. Evidence for **lexicalised compound** (the analysis that would instead give 歹食 its own entry, mirroring 好食): this dataset already treats the antonymous 好- pattern that way rather than as a sense of 好, on the grounds that 好食/好看/好聽 read as fixed words, not a live 好- + V template — the same test applied to 歹- has not actually been run. Whichever way this resolves, 歹's other 歹-V collocations should be modelled the same way.  |
