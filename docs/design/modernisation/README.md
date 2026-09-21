# Web modernisation baseline and acceptance record

Tracking: https://github.com/teochew-works/teochew-dictionary/issues/296

## Reproduction

Build core, then the root dataset, install web dependencies, and run:

```sh
node web/scripts/measure-dictionary.mjs
cd web
npm run check
npm run build
npm run preview -- --host 127.0.0.1
```

`baseline-node.json` is a desktop Node proxy against the current generated
artifact. It records the artifact hash, raw/gzip size, parse/index time, ten
samples per query and a memory snapshot. It does not measure browser rendering,
network latency, peak heap or performance on a phone. Repeat on the same machine
with the same artifact before comparing subsequent changes.

## Source-confirmed baseline

- Dictionary data is fetched by App even for a direct Settings/About visit.
- Each mounted dictionary browser constructs a Fuse index.
- Six production destinations share the primary navigation; its phone CSS was
  designed around four. Rendered overflow must be checked at each width below.
- Global tokens used by portalled controls are owned by FlashcardsView.css.
- Query and sort state are lost when DictionaryView unmounts.

## Existing mobile work to preserve

The older `../mobile.md` is historical investigation, not an open checklist.
Current source already includes dynamic viewport height, safe-area padding,
phone list/detail switching, hash entry links, collapsed phone filters, an
off-canvas deck rail, install/update prompts, backup/restore and explicit offline
data storage. Verify these behaviors rather than implementing them again.

## Required browser and device acceptance

Record browser version, viewport, input method and result for each run. A blank
checkbox means unverified, not passed. Use isolated browser storage for backup,
restore and review tests; never reset a learner's actual state.

- [ ] Light/dark screenshots at 320, 375, 640, 768 and 1280 CSS pixels.
- [ ] Dictionary, selected entry, Study, deck management, Sounds and Settings.
- [ ] No horizontal page overflow; text zoom/reflow does not obscure actions.
- [ ] Lookup → listen → add to deck → study → back preserves context.
- [ ] Keyboard focus/order, screen-reader names and overlay focus return.
- [ ] No dictionary request on direct unrelated routes after loading changes.
- [ ] Offline opt-in, cold offline start, failed download and waiting update.
- [ ] Existing deck/SRS backup restores and grading undo remains correct.
- [ ] Real iOS Safari and Android audio, safe areas and touch interactions.
- [ ] Representative learner walkthrough and resulting blockers recorded.

## Initial regression budgets

Behavioral gates apply immediately: unrelated routes must fetch zero dictionary
bytes after optimisation; a stable loaded dataset should need one shared index;
representative search ranking must remain unchanged. Timing budgets require a
browser baseline on a named device before adoption. Do not convert Node proxy
numbers into unsupported mobile latency claims.
