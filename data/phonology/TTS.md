# Text-to-speech / IPA-to-audio: research findings · issue #58

> The conclusion is recorded as [ADR-0016](../../docs/adrs/adr-0016.md).

Issue #58 asked whether text-to-speech — more precisely, phoneme/IPA-to-audio
synthesis — could plausibly supplement this project's audio pipeline: a
placeholder for a not-yet-recorded syllable, a preview while waiting on a
speaker session, or similar. All audio today comes from consenting volunteer
speakers under the process in [`AUDIO-CONSENT.md`](../../AUDIO-CONSENT.md),
feeding the recording effort tracked in #36 (Chaozhou, the reference variety)
and #37 (Shantou/Chaoyang overlays). This document is pure research — no
code or data changes accompany it, per the issue's scope.

Four realistic paths were surveyed, each judged on the three axes the issue
asked for: **naturalness**, **availability of a Teochew/Southern-Min voice or
profile**, and whether **tone contours** — this dataset's Chao pitch
numerals (`varieties/chaozhou.yaml` → `tones:`, e.g. `2: "53"`, `3: "213"`,
rendered as superscript digits appended to a syllable by
`src/phonology/ipa.ts`, not a time-varying curve) — can actually be
specified, as opposed to just phonetic segments.

## Summary

| Option | Teochew/Southern-Min asset exists? | Tone contour controllable? | Naturalness | Verdict |
|---|---|---|---|---|
| Rule-based (eSpeak-NG) | No — would be built from scratch | Yes, in principle — the same mechanism its Mandarin/Cantonese/Hakka profiles already use | Synthetic/robotic by construction | Technically viable; not recommended to pursue now (§5) |
| Commercial neural TTS (Polly/Azure/Google) | No | No — IPA phoneme override doesn't reach the Chinese voices at all on two of three platforms, and none can encode a Chao contour | High, but for the wrong language | Not viable |
| Articulatory synthesis (VocalTractLab) | No — would be hand-built | Yes, in principle — its pitch model is built for exactly this kind of contour | Below commercial neural TTS even for its best-supported language (German) | Not viable at this project's scale |
| Training/fine-tuning on this project's own clips | N/A (no existing model to start from) | N/A | N/A | Not viable as currently recorded (isolated single syllables) |

## 1. Rule-based / formant synthesis — eSpeak-NG

**No Teochew, Chaoshan, or Southern Min profile exists.** eSpeak-NG's
supported-language list
([`docs/languages.md`](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md))
covers exactly three Sinitic varieties: Mandarin (`cmn`), Cantonese (`yue`),
and Hakka (`hak`) — no Southern Min at all, so there's no Hokkien/Taiwanese
profile to lean on either, despite it being the closer relative. One
unofficial fork, `nlpguyz/espeak-ng`, advertises broader Chinese-dialect
ambitions, but its phoneme/dictionary sources contain no Teochew or Minnan
material and it hasn't been touched since 2017-11-08 — dead, not a usable
starting point. No community project applying eSpeak-NG (or Festival,
MBROLA) to Teochew or Chaoshan Min was found.

**Raw IPA input is not supported.** `-x`/`--ipa` are output-only flags.
Direct phoneme input via `[[...]]` bracket syntax exists, but the string
must be espeak's own ASCII/Kirshenbaum-style mnemonics for the *loaded
language's* phoneme table, not free-form Unicode IPA. A feature request for
`<phoneme alphabet="ipa">` SSML support
([espeak-ng#539](https://github.com/espeak-ng/espeak-ng/issues/539), 2018)
remains unresolved; a 2023 comment on that thread states plainly there is no
language file able to speak the entire IPA without post-processing.

**Tone contours are, unexpectedly, well supported architecturally.**
eSpeak-NG has a real `Tone(start, end, envelope, NULL)` phoneme instruction,
and Mandarin's own source file (`phsource/ph_cmn`) defines tone phonemes
*named after Chao tone-letter numerals* — `55`, `35`, `214`, `51`, `21` —
with `dictsource/cmn_rules` mapping pinyin tone digits straight onto them.
Cantonese and Hakka use the identical mechanism. This is a per-syllable
lexical-tone system, separate from eSpeak's sentence-level intonation model,
and it is structurally close to exactly what this project's own tone
representation needs (contour digits per syllable). A newer, more
declarative `Tone(start, middle, end)` model is documented as "in the
process of being implemented" — aspirational, not yet shipped — but the
`Tone()` + envelope mechanism above is real and already proven for three
Sinitic languages.

**Effort to build a minimal profile.** eSpeak-NG's own
[`docs/add_language.md`](https://github.com/espeak-ng/espeak-ng/blob/master/docs/add_language.md)
pitches this as mostly non-programming work — a phoneme table, a tone table,
and text→phoneme rules, hopefully enough for "rough... intelligible" output
on a first pass. Given Mandarin's precedent, the tone table is close to a
known recipe. The phoneme table (checked/entering tones ending in stops or a
glottal stop, nasalized vowels, the `/dz/`-type initial — see
[REVIEW.md](REVIEW.md) §5) and rule authoring would be real, from-scratch
linguistics work, plausibly low tens of hours for a rough pass and
open-ended beyond that for naturalness and tone sandhi.

**Verdict.** Of the four options, this is the only one with a proven,
reusable mechanism for the exact thing this dataset needs (Chao-numeral
tone). But there is nothing Teochew-specific to build from, and the ceiling
is a synthetic-sounding approximation, not natural speech — see §5 for why
this isn't recommended as an active priority despite being technically
sound.

## 2. Commercial neural TTS phoneme overrides — Polly, Azure, Google Cloud

**No Teochew/Chaoshan/Southern-Min voice on any of the three**, confirmed
directly against current voice lists: Amazon Polly offers `cmn-CN`
(Mandarin) and `yue-CN` (Cantonese,
[added 2022](https://aws.amazon.com/about-aws/whats-new/2022/09/amazon-polly-cantonese-language-support/));
[Azure AI Speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
offers `zh-CN`, `zh-TW`, `zh-HK`/Cantonese (preview), and `wuu-CN`
(Wu/Shanghainese, preview, reachable only as a secondary locale); Google
Cloud offers `cmn-CN`, `cmn-TW`, and `yue-HK`. Nothing Southern Min on any
platform.

**IPA phoneme override does not reach the Chinese voices at all on two of
three platforms.** Azure's `zh-CN`/`zh-HK` phone sets are Pinyin/Jyutping-
native with numeric tone suffixes; an unrecognized phone returns an HTTP 400
([phonetic sets](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets)).
Google requires the `pinyin`/`jyutping` alphabet specifically for its
Mandarin/Cantonese voices; raw IPA is offered only for a separate list of
non-Sinitic languages
([supported phonemes](https://docs.cloud.google.com/text-to-speech/docs/phonemes)).
Polly is the outlier: it accepts `<phoneme alphabet="ipa">` syntactically,
but its own documentation says IPA/X-SAMPA "should not be used for Chinese
transcription" — use its proprietary `x-amazon-pinyin`/`x-amazon-jyutping`
instead
([phoneme tag docs](https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html)).

**What actually happens with Teochew IPA on an unrelated voice.** An AWS
re:Post user reported that IPA tone letters fed to Polly's Mandarin voice
"seem to be ignored" — consistent with Polly's own warning. None of the
three platforms' phoneme documentation shows any mechanism for a Chao pitch
contour to survive a phoneme-override tag; tone is only ever expressible
through each platform's own locale-locked, tone-digit-suffixed romanization,
tied to that voice's *trained* tone categories. No official statement,
paper, or credible report of this technique working for any untrained
tonal/low-resource language (Teochew or otherwise) was found — published
work that solves this problem trains or fine-tunes a new acoustic model
instead (see §4), it doesn't repurpose a commercial voice's phoneme
override.

**Cost.** All three are metered, paid, network-dependent APIs (roughly
$4–30 per million characters); trivial at dictionary scale, but moot given
the above.

**Verdict — and a direct answer to the issue's question about whether
misapplied output would be "useful for anything, or actively misleading":**
actively misleading. The realistic result of feeding Teochew IPA into a
Mandarin or Cantonese voice isn't "rough Teochew with some wrong details" —
it's fluent, confidently-voiced Mandarin/Cantonese phonology, with Teochew's
actual segments and tones either coerced into that voice's trained
categories or silently dropped, presented with the polish of a native TTS
voice. A learner has no way to detect the error from the audio alone. For a
pedagogical tool, that is worse than no audio at all.

## 3. Articulatory synthesis — VocalTractLab, Pink Trombone

**VocalTractLab (VTL)** is Peter Birkholz's (TU Dresden) physical
vocal-tract simulator — 24 vocal-tract + 9 glottal/vocal-fold parameters,
fitted from MRI data of a German speaker. It is actively maintained (VTL 2.4
released 2025-12-05) but explicitly positioned as a research/educational
tool, not a production TTS system
([project background](https://vocaltractlab.de/index.php?page=background)).
The best available quality data, Krug, Stone & Birkholz 2021
([ISCA SSW11](https://www.isca-archive.org/ssw_2021/krug21_ssw.html)), puts
VTL's intelligibility and naturalness on par with older academic/
non-commercial TTS (MaryTTS, MBROLA diphone synthesis, HMM-based DRESS) and
significantly below commercial neural/concatenative systems — for German,
its best-supported language. No work applying VTL to Teochew or any Sinitic
tonal language was found; the closest precedent, Prom-on, Birkholz & Xu 2014,
fit Thai vowel articulatory *targets* in VTL but held tone constant rather
than synthesizing Thai's actual contours.

**Pitch (F0) control is, encouragingly, built on the right model in
principle.** VTL's gestural scores use Yi Xu's Target Approximation model —
the standard academic framework for contour-tone languages, and the same one
underlying the Thai work above. In practice, though, the default is one
pitch target per syllable; a non-monotonic Teochew contour like tone 3's
`213` (fall-then-rise within one syllable) would need two sequential F0
gestures hand-chained per syllable. Achievable, but it requires real
familiarity with VTL's gesture/target-approximation model — not a one-line
API call.

**Segmental control would be built from nothing.** VTL's consonants are
hand-tuned prototype target shapes fitted to X-ray/MRI data, shipped only
for German (plus some English). There is no pre-built Teochew inventory;
checked-tone syllable-final glottal closure — the Southern Min feature that
matters most here — is undocumented territory in VTL, not an existing
target to reuse. Nasalized vowels are plausible via VTL's existing
continuous velum-aperture parameter, but would still need custom target
shapes.

**Pink Trombone** (the original browser toy, and its known forks) has no
batch, scripting, or tone-contour interface at all — it's a real-time,
frame-by-frame DSP demo. Forks add control surfaces (e.g. OSC), not a
text/tone-to-speech pipeline; more serious derivatives rewrite the DSP as
differentiable code for gradient-based *analysis* (fitting parameters to a
target spectrogram), holding pitch constant — research tools for a different
problem, not synthesis.

**Verdict.** Technically plausible in principle — the pitch model is
appropriate for contour tone, and the articulatory parameters are
continuous enough to plausibly reach glottal-stop codas and nasalization.
But building even one clean Teochew segment inventory by hand, then
authoring gestural scores with multi-target F0 tiers per syllable, is
realistically a multi-week-to-months undertaking for someone willing to
learn VTL's model deeply — on a synthesizer whose own naturalness ceiling
sits below commercial TTS even for German. Not a stopgap-scale effort for
this project. Pink Trombone is not a candidate in any current form.

## 4. Training/fine-tuning neural TTS on this project's own recordings

**A directly on-topic academic precedent exists.** Magistry, Wang & Lim,
["Experiments on Speech Synthesis for Teochew, Can Taiwanese
Help?"](https://aclanthology.org/2024.lrec-main.598.pdf) (LREC-COLING 2024)
trained VITS (via Coqui-TTS) on ~9,146 syllables — 4,388 recordings from the
WhatTCSay dictionary app (mostly isolated words, plus some phrasebook
sentences). Their best Teochew-only model reached MOS 3.66/5 against a
human ceiling of 4.57 — "promising," explicitly not production quality.
Tone was handled *implicitly* (romanized text with tone diacritics fed
straight to the end-to-end model, no explicit tone-embedding component), and
the authors flag tone-sandhi realization in longer phrases as an unresolved
problem. A single isolated syllable, by construction, can never exhibit
sandhi (sandhi requires a following syllable) — which matters directly for
this project, since #34/[REVIEW.md](REVIEW.md) §14 already put sandhi-shifted
surface forms in scope for what should be recorded and understood.

**Cross-lingual transfer from Hokkien/Taiwanese was tested directly, and did
not help.** The same paper fine-tuned/augmented with the Taiwan MOE Southern
Min dictionary corpus (500+ hours) and found no reliable benefit —
improvement in one evaluation setup, a regression in another, "not as
conclusive as we expected." They also evaluated Meta's Massively
Multilingual Speech VITS model's Southern Min (`nan`) code
([Pratap et al. 2023](https://arxiv.org/abs/2305.13516)) as a pretrained
base and found its training data mislabeled and inconsistent — mixing
Teochew, Taiwanese, and Penang Hokkien sources — concluding it is
"irrelevant" for Teochew specifically. Phonological closeness to Hokkien
does not, on this evidence, translate into a usable shortcut.

**Other Sinitic low-resource TTS precedent confirms the pattern.**
Teochew-Wild ([arXiv 2505.05056](https://arxiv.org/abs/2505.05056), 2025)
used an 18.9-hour, 20-speaker, fully-connected-speech corpus (Tacotron2, MOS
3.52), and found autoregressive models tracked sandhi context better than
non-autoregressive ones — context that only exists in connected speech.
VoxHakka (Taiwanese Hakka,
[arXiv 2409.01548](https://arxiv.org/abs/2409.01548)) needed 140+ hours of
complete-sentence data for a comparably low-resource Sinitic topolect.

**General voice-cloning/fine-tuning TTS needs continuous speech, not
isolated syllables, independent of quantity.** Modern few-shot systems
(XTTS-v2, YourTTS) can clone a voice from as little as 3–10 seconds of
*reference* audio, and practical fine-tuning guidance converges on roughly
20 minutes to a few hours of *clean, continuous* audio for a new voice — but
that capability rides on massive pretraining (XTTS-v2: 27,300 hours across
16 languages; YourTTS: 529 hours). These architectures model coarticulation
and phrase-level prosody in sentence context; a corpus of single, isolated
syllables with silence on either side structurally resembles diphone
inventory data, not neural-TTS training data — a mismatch of kind, not just
of scale.

**This project's own recording plan is isolated single-syllable clips
only** (the "whole-syllable clips, never a component" decision at
[REVIEW.md](REVIEW.md) §11), so the architectural mismatch above applies
directly, regardless of how large the clip count eventually grows. Even the
one directly relevant academic result needed roughly an order of magnitude
more material than this project's current or near-term scale — including
some connected-speech context — funded by a research grant and HPC
allocation, done by linguists with TTS engineering expertise, and it still
only reached "promising, not production."

**Verdict.** Not viable as currently scoped. It would only become
attempt-able if the recording strategy itself changed to also capture
genuinely connected speech (multi-syllable words with natural sandhi,
ideally short read sentences) per speaker/variety — a change to #36/#37's
scope, not something this issue proposes. Even then, matching the existing
academic result (itself only "promising") would be a nontrivial ML
undertaking on top of that, and cross-lingual transfer from Hokkien/
Taiwanese should not be assumed to reduce the burden.

## 5. Overall verdict

**Synthesis is not recommended as a near-term stopgap or supplement to the
human-recording pipeline.** Three of the four paths are dead ends outright:
no commercial platform has a usable mechanism for Teochew's tone system, and
misapplying Teochew IPA to an unrelated voice would actively mislead a
learner rather than merely sound rough (§2); training on this project's own
data is blocked by an architectural mismatch, not a data-volume problem,
given the current isolated-syllable recording format (§4); and articulatory
synthesis, while technically closer in principle, is too large a hand-tuning
undertaking for a synthesizer whose naturalness ceiling sits below
commercial TTS even for its best-supported language (§3).

**Rule-based synthesis (eSpeak-NG) is the one genuinely technically viable
path** — its `Tone()` mechanism is a near-exact structural match for this
dataset's Chao-numeral tone contours, already proven for three Sinitic
languages (§1). It is deliberately *not* being filed as a follow-up
integration issue, for three reasons taken together: (a) there is no
Teochew/Southern-Min asset to build from, so this would be new from-scratch
linguistics work, not integration of something that already exists;
(b) its output ceiling is a synthetic-sounding approximation, not a
substitute for a real speaker — useful only as a clearly-labeled
placeholder, never as the audio a learner should trust; and (c) the gap it
would fill is already bounded and actively being closed the straightforward
way — [REVIEW.md](REVIEW.md) §12 counted 340 (syllable, variety) pairs
attested today against a "low-thousands" ceiling, and #36/#37 are already
scoped to record exactly that. The effort a from-scratch eSpeak-NG profile
would take is better spent there. If the recording effort ever stalls for a
prolonged period on speaker availability specifically — the concrete
problem this issue named as the motivating gap — revisit eSpeak-NG then; the
technical path documented here would still apply.

## Sources checked

- eSpeak-NG: [supported languages](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md), [add-language guide](https://github.com/espeak-ng/espeak-ng/blob/master/docs/add_language.md), [phoneme model doc](https://github.com/espeak-ng/espeak-ng/blob/master/docs/phoneme_model.md), [issue #539](https://github.com/espeak-ng/espeak-ng/issues/539) (IPA SSML request), `nlpguyz/espeak-ng` fork (inspected, last commit 2017-11-08)
- Amazon Polly: [supported languages](https://docs.aws.amazon.com/polly/latest/dg/SupportedLanguage.html), [Cantonese launch announcement](https://aws.amazon.com/about-aws/whats-new/2022/09/amazon-polly-cantonese-language-support/), [phoneme tag docs](https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html), [Cantonese phoneme table](https://docs.aws.amazon.com/polly/latest/dg/ph-table-cantonese.html), [pricing](https://aws.amazon.com/polly/pricing/)
- Azure AI Speech: [language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support), [phonetic sets](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets), [SSML pronunciation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation), [pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
- Google Cloud TTS: [supported voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types), [supported phonemes](https://docs.cloud.google.com/text-to-speech/docs/phonemes), [SSML docs](https://docs.cloud.google.com/text-to-speech/docs/ssml), [pricing](https://cloud.google.com/text-to-speech/pricing)
- VocalTractLab: [project site](https://vocaltractlab.de/index.php?page=background), [download/changelog](https://vocaltractlab.de/index.php?page=vocaltractlab-download), [publications](https://vocaltractlab.de/index.php?page=birkholz-publications), [TargetOptimizer](https://vocaltractlab.de/index.php?page=targetoptimizer-about), Krug, Stone & Birkholz 2021, [*Intelligibility and naturalness of articulatory synthesis with VocalTractLab compared to established speech synthesis technologies*](https://www.isca-archive.org/ssw_2021/krug21_ssw.html) (ISCA SSW11), Prom-on, Birkholz & Xu 2014, [*Estimating vocal tract shapes of Thai vowels from contextual tonal variation*](https://vocaltractlab.de/publications/prom-on-2014-cocosda.pdf), `TUD-STKS/VocalTractLabBackend-dev` and `paul-krug/VocalTractLab-Python` (GitHub)
- Pink Trombone: [original](https://experiments.withgoogle.com/pink-trombone) and forks (`zakaton/Pink-Trombone`, `jamesstaub/pink-trombone-osc`, `chdh/pink-trombone-mod`, `yonatanrozin/Modular-Pink-Trombone`), independent technical writeup at kaushikv.com/notes/pink-trombone/
- Magistry, Wang & Lim 2024, [*Experiments on Speech Synthesis for Teochew, Can Taiwanese Help?*](https://aclanthology.org/2024.lrec-main.598.pdf) (LREC-COLING 2024)
- Teochew-Wild, [arXiv 2505.05056](https://arxiv.org/abs/2505.05056)
- VoxHakka, [arXiv 2409.01548](https://arxiv.org/abs/2409.01548)
- Meta Massively Multilingual Speech, Pratap et al. 2023, [arXiv 2305.13516](https://arxiv.org/abs/2305.13516)
- XTTS, [arXiv 2406.04904](https://arxiv.org/pdf/2406.04904); YourTTS, [arXiv 2112.02418](https://arxiv.org/abs/2112.02418); [Coqui XTTS fine-tuning docs](https://coqui-tts.readthedocs.io/en/latest/training/finetuning.html); survey: [*A Survey on Neural Speech Synthesis*](https://arxiv.org/pdf/2106.15561)
