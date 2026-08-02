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
`sources:` list, resolved against `data/sources.yaml`.

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

**A live example of the risk §3 already flags.** While scoping this change,
an automated fetch of `mogher-region-diff`'s page produced a natural-language
gloss that asserted "Chaoyang fronts `io` like Chaozhou" in one sentence while
quoting the page's own raw table notation showing the opposite in the next.
The raw notation was trusted, the gloss was not — but this is the same
summarizer-garbling failure mode §3 already names for Chao pitch digits,
just showing up on a rime correspondence instead of a tone contour. It is why
the `io`/`ioh` mappings above stay at `medium`: this is currently a single
source, and a human should read the raw table directly before raising it.

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
