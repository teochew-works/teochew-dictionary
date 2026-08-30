# Audio recording consent

This project records short spoken-syllable clips from volunteer speakers to
illustrate Teochew pronunciation. A voice recording is a separately
copyrightable performance, distinct from the phonological fact it captures —
see `README.md` § Licensing, `data/phonology/REVIEW.md` § 13, and
[ADR-0015](docs/adrs/adr-0015.md). That means
a speaker's consent is needed for the *recording itself*, on top of whatever
provenance the `teochew-dictionary-audio` source in `data/sources.yaml`
already establishes for the dataset.

## What a speaker is agreeing to

- Your recorded voice, for the syllables you record, is released publicly
  under [CC-BY-4.0](LICENSE-DATA-CC-BY-4.0) — the same licence this
  project's data uses by default.
- CC-BY-4.0 is irrevocable once a clip is published: a clip can be
  re-recorded or dropped from future releases, but copies already
  distributed under the licence can't be recalled. Make sure this is
  understood and accepted before recording, not after.
- You're credited by a pseudonymous identifier (e.g. `speaker-1`), recorded
  in the clip's `speaker` field — not necessarily your real name. Say so if
  you'd rather be credited by name, or not credited beyond the pseudonym.
- No personal data beyond that pseudonymous identifier is collected as part
  of a recording.

## Process, for whoever runs a recording session

1. Explain the above to the speaker and get an explicit yes, before any
   recording is made — not implied by showing up to record.
2. Assign (or let the speaker pick) a pseudonymous id, used consistently
   across all of their clips.
3. Keep your own record of how consent was given (a saved message, an
   email, a dated note) outside of this repository. A clip's `speaker`
   field records who spoke it, not that they agreed to release it.
4. A speaker may ask for their future, not-yet-recorded contributions to
   stop at any time. Clips already published stay under CC-BY-4.0, per the
   irrevocability note above.

## Scope: this process is for clips recorded *by this project*

This process governs recordings made for this project specifically, backed
by the `teochew-dictionary-audio` source in `data/sources.yaml`. It does not
apply to audio imported from an existing outside corpus — e.g. the Lingua
Libre/Wikimedia Commons import (issue #106, `data/phonology/REVIEW.md` §
16), backed by the `lingualibre` source. Those speakers already gave consent
through Commons' own upload flow when they published under CC-BY-SA-4.0, and
their `speaker` field records their real Commons/Wikimedia username, not a
project-assigned pseudonym. Don't assume every clip's `speaker` field went
through the pseudonym/opt-out process above — check which source it cites.
