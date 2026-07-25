# Open questions for a native speaker or specialist

The phonology tables were assembled from general descriptions of Teochew. The
mappings marked `confidence: high` are well attested and consistent across
sources. The ones below are **not settled**, and the dataset carries them with
lower confidence so that derived IPA can be trusted selectively rather than
wholesale.

Anything here can be corrected by editing a YAML file. None of it requires
touching code.

---

## 1. The `e` / `ê` vowel split  ·  `varieties/chaozhou.yaml`

**Encoded as:** `ê` → /e/, bare `e` → /ɯ/.

The Peng'im scheme uses the circumflex to distinguish the front mid vowel from
the high back unrounded one. Sources that drop the circumflex — which is most
informal writing, and a fair amount of published material — conflate the two.
This affects a large share of the lexicon (魚 `he5`, 豬 `de1`, 書 `ze1`, 你 `le2`
all hinge on it), so it is the single highest-value thing to confirm.

**Test words:** 魚 `he5`, 豬 `de1`, 書 `ze1`, 你 `le2` (all bare `e`) against 茶
`dê5`, 肉 `nêg8`, 百 `bêh4` (all `ê`). Hearing the two sets side by side in
citation form would settle it immediately.

## 2. Chaozhou `io` → [ie] fronting  ·  `varieties/chaozhou.yaml` → `irregular`

**Encoded as:** Chaozhou `io` → [ie]; Shantou `io` → [io].

This is the difference behind 潮 being [tie⁵⁵] in Chaozhou city and [tio⁵⁵] in
Shantou. The open rime is reasonably attested. **Whether the fronting extends to
`iong`** is marked `confidence: low` — it is a guess by analogy, and may well be
wrong. If it does not front, delete the `iong` key from the Chaozhou `irregular`
block and the compositional rule takes over.

**Test words:** 潮 `dio5`, 少 `zio2`, 上 `ziong6`.

## 3. The tone sandhi table  ·  `sandhi/chaozhou.yaml`  ⚠️ `needs_review: true`

The whole table is provisional. Published Chaozhou sandhi descriptions disagree
with each other, and speakers vary. The encoded values are the pattern most
commonly reported:

| Citation | → Surface | Contour |
|----------|-----------|---------|
| 1 (33)   | 1         | 23      |
| 2 (53)   | 6         | 35      |
| 3 (213)  | 2         | 53      |
| 4 (2)    | 8         | 5       |
| 5 (55)   | 7         | 11      |
| 6 (35)   | 7         | 31      |
| 7 (11)   | 7         | 11      |
| 8 (4)    | 4         | 2       |

**Known scope limitation:** the engine treats a whole headword as one tone group.
That is correct for compounds, but real phrase-level sandhi domains are set by
syntax, and a long phrase regroups. Anything beyond a compound should be treated
as approximate.

## 4. Citation tone contours  ·  `varieties/*.yaml` → `tones`

Tone 2 is given as 53 for Chaozhou and 52 for Shantou; tone 3 as 213. Both are
reported with variation in the literature. These affect only the numeric tone
letters in derived IPA, not the tone *numbers*, so an error here is cosmetic
rather than structural.

## 5. The `r` initial  ·  `varieties/chaozhou.yaml`

**Encoded as:** /dz/, `confidence: medium`.

Realised [dz] ~ [z] ~ [l] depending on speaker, register and age, with younger
speakers reported to merge it toward /l/. A single IPA value cannot capture
this. If the variation matters for your use, the honest fix is to model it as an
alternation rather than pick one.

## 6. The `oi` and `ou` nuclei  ·  `varieties/chaozhou.yaml`

Encoded as [oi] and [ou] at `confidence: medium`. Some descriptions transcribe
these with different second elements. Low impact, but easy to confirm.

## 7. The `-d` /t̚/ coda  ·  `pengim.yaml`, `varieties/chaozhou.yaml`

Encoded at `confidence: low`. Teochew merged the /-t/ coda away, so this should
appear in essentially no colloquial entries. It is retained only so that literary
readings that use it can be written. **If nothing in the lexicon ever needs it,
delete it** — a coda that cannot occur is a validation hole, because it lets a
typo like `bad4` parse cleanly.

---

## Individual entries flagged `needs_review`

Run `npm run validate` for the current count. As of writing:

| Entry | Question |
|-------|----------|
| 乜 `mih8` | Peng'im spelling and tone both uncertain. |
| 底儂 `di6 nang5` | The usual word for "who"; form and tones need confirming. |
| 米 `bhi2` | Initial may be `bh-` or `b-`; Hokkien has `bí`, which may have influenced the transcription. |
| 阿媽 `a1 ma2` | Glossed "grandmother"; confirm it is not also used for "mother" in some families. |
