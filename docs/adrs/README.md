# Architecture Decision Records

[Home](../../) > [Docs](../) > Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for the Teochew Dictionary.

An ADR is a short document that captures a single significant decision along with its context and
consequences. ADRs record *why* the project is shaped the way it is — and, just as importantly,
which approaches were considered and **rejected** and why.

They complement the rest of the documentation rather than replacing it:

- [README.md](../../README.md) — how to use the project today, organised by task and issue.
- [data/phonology/REVIEW.md](../../data/phonology/REVIEW.md) — open linguistic questions, and the
  test words that would resolve them.
- [web/README.md](../../web/README.md) — how the frontend works.
- [AUDIO-CONSENT.md](../../AUDIO-CONSENT.md) — the speaker-consent process.

For more background on the practice, see
[Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
by Michael Nygard.

## Status Legend

| Emoji | Status     | Meaning                               |
|-------|------------|---------------------------------------|
| 🟡    | Proposed   | Under discussion, not yet agreed upon |
| ✅    | Accepted   | Agreed and in effect                  |
| ❌    | Deprecated | No longer applies                     |
| 🔄    | Superseded | Replaced by a newer ADR               |

## Inventory

| ADR                     | Status      | Date       | Title                                                              |
|-------------------------|-------------|------------|--------------------------------------------------------------------|
| [ADR-0000](adr-0000.md) | ✅ Accepted | 2026-08-30 | Use Architecture Decision Records                                  |
| [ADR-0001](adr-0001.md) | ✅ Accepted | 2026-08-30 | Store Peng'im Only; Derive IPA, POJ and Sandhi                     |
| [ADR-0002](adr-0002.md) | ✅ Accepted | 2026-08-30 | A Reference Variety with Sparse Overlays                           |
| [ADR-0003](adr-0003.md) | ✅ Accepted | 2026-08-30 | Confidence and Sources on Every Phonology Mapping                  |
| [ADR-0004](adr-0004.md) | ✅ Accepted | 2026-08-30 | Zod Schemas as the Source of Truth for Types and JSON Schema       |
| [ADR-0005](adr-0005.md) | ✅ Accepted | 2026-08-30 | Hand-Editable YAML Is the Product; `dist/` Is Generated            |
| [ADR-0006](adr-0006.md) | ✅ Accepted | 2026-08-30 | Importers Write Only to `data/staging/`                            |
| [ADR-0007](adr-0007.md) | ✅ Accepted | 2026-08-30 | License Code and Data Separately                                   |
| [ADR-0008](adr-0008.md) | ✅ Accepted | 2026-08-30 | Derive an Entry's Licence and Attributions from Its Sources        |
| [ADR-0009](adr-0009.md) | ✅ Accepted | 2026-08-30 | Distinguish `import` Sources from `reference` Sources              |
| [ADR-0010](adr-0010.md) | ✅ Accepted | 2026-08-30 | Grow the Lexicon Against Checklists with a Defined Denominator     |
| [ADR-0011](adr-0011.md) | ✅ Accepted | 2026-08-30 | Enumerate Wiktionary Headwords by `insource:` Search               |
| [ADR-0012](adr-0012.md) | ✅ Accepted | 2026-08-30 | Keep Network Access Out of `npm run check`                         |
| [ADR-0013](adr-0013.md) | ✅ Accepted | 2026-08-30 | A Shared, Symlinked `.cache` Outside Any Checkout                  |
| [ADR-0014](adr-0014.md) | ✅ Accepted | 2026-08-30 | Host Audio Bytes on GitHub Releases with an In-Repo Manifest       |
| [ADR-0015](adr-0015.md) | ✅ Accepted | 2026-08-30 | Per-Clip Audio Licensing, with Consent Tracked Outside the Repo    |
| [ADR-0016](adr-0016.md) | ✅ Accepted | 2026-08-30 | Reject TTS Synthesis as an Audio Supplement                        |
| [ADR-0017](adr-0017.md) | ✅ Accepted | 2026-08-30 | Browser Recording Stages a Proposal; Publishing Stays a CLI Step   |
| [ADR-0018](adr-0018.md) | ✅ Accepted | 2026-08-30 | Splice YAML Backfills by Byte Offset, Not Parse → Stringify        |
| [ADR-0019](adr-0019.md) | ✅ Accepted | 2026-08-30 | A Static, Backend-Free Web UI as an Independent npm Project        |
| [ADR-0020](adr-0020.md) | ✅ Accepted | 2026-08-30 | A Hand-Rolled SM-2 Scheduler over IndexedDB                        |
| [ADR-0021](adr-0021.md) | ✅ Accepted | 2026-08-30 | One Drag Engine, Keyboard Parity, and Undo Instead of Confirmation |
| [ADR-0022](adr-0022.md) | ✅ Accepted | 2026-08-30 | Derive CEFR `level` from HSK Cognates; Reject an HSK 3.0 Crosswalk |
| [ADR-0023](adr-0023.md) | ✅ Accepted | 2026-08-30 | A Responsive PWA over a Native Wrapper, with Workbox Exception     |
| [ADR-0024](adr-0024.md) | ✅ Accepted | 2026-09-05 | Shared Logic Lives in `@teochew/core`, Published from This Repo    |

ADR-0001 through ADR-0022 were written **retrospectively**, in one pass over the project's
existing record, so their git-derived dates are all the date of adoption rather than the date each
decision was made. Each record states its own decision date and issue number in the text.
ADR-0023 was written alongside its own work (issue #194) and was renumbered from 0001 when the
retrospective batch landed.

The inventory is maintained by the `update-adr-inventory` skill, which scans `adr-*.md` for the
title and status and derives the date from git history. Run it whenever an ADR is added or its
status changes.
