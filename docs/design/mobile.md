# Mobile-Friendly UI and iOS/Android Support

[Home](../../) > [Docs](../) > Design > Mobile

Investigation and design for [issue #194](https://github.com/teochew-works/teochew-dictionary/issues/194).
Implementation is deliberately **not** in scope here; the follow-up issues at the end are.

Measurements below were taken by running `web/` against a 375 × 812 CSS-pixel layout
viewport (iPhone-class) in a Chromium engine, reading real `getBoundingClientRect()` and
`scrollWidth` values rather than eyeballing screenshots. Numbers are quoted so a later
change can be checked against them.

---

## 1. Where the app stands today

The shell (`web/src/App.tsx`, `App.css`) is a header with an `h1` and four `#hash` tab
links above a flex `main`. Each of the four views owns its own layout CSS. There is no
manifest, no service worker, and no icon beyond the inline-SVG favicon.

Responsive work so far is three ad-hoc breakpoints, none of them phone-width:

| Breakpoint | File | What it does |
|------------|------|--------------|
| `max-width: 1100px` | `FlashcardsView.css:1416` | hides the browse drawer's hint text |
| `max-width: 860px` | `FlashcardsView.css:1791` | stacks the deck rail above the main column |
| `max-width: 620px` | `SoundsView.css:207` | collapses `.sound-row` to one column |

`DictionaryView.css` and `SettingsView.css` have no media queries at all.

---

## 2. Audit findings

### 2.1 Blockers — features that do not work on a phone

**The dictionary is a fixed two-pane split with no breakpoint.**
`.dictionary-view__list-pane` is `flex: 1 1 20rem; min-width: 16rem; max-width: 26rem`
and `.dictionary-view__detail-pane` is `flex: 2 1 20rem`
([DictionaryView.css:19](../../web/src/views/DictionaryView.css)). At a 375px viewport the
list pane pins to its 256px minimum and the detail pane gets **119px** — measured. Entry
detail (readings, IPA, POJ, glosses, licensing) is unreadable. This is the single worst
layout in the app.

**The Sounds controls row overflows and puts "Chart" off-screen.**
`.sounds-view__controls` is a non-wrapping flex row. Measured `scrollWidth` **609px**
against a `clientWidth` of **375px**; the "Chart" sort button lands at x 397–468, entirely
outside the viewport, in a container with no `overflow` scroller. The whole document
scrolls sideways by 234px, so the button is reachable only by horizontally panning the
page — most users will conclude the feature does not exist.

**The syllable chart is invisible in chart mode.**
`.sounds-view__chart-detail` is a fixed `width: 22rem` (352px) side panel and
`.sounds-view__chart-grid-scroll` takes what is left. Measured at 375px: the grid's scroll
viewport is **17px wide** holding **1304px** of content.

**The flashcard is below the fold on every session.**
At 375 × 812, `.rail` stacks to 329px tall, `.table` to 266px, `.bar` to 139px — so
`.study` starts at y **864** and `.card` at y **886**, in an 812px viewport. Reaching the
thing the screen exists for requires scrolling past the whole chrome, every time. The grade
buttons sit at y 1087.

**The tab bar overflows.** `.app__tabs` is a non-wrapping flex row measuring **414px** of
content in a 375px viewport, giving the document 59px of horizontal scroll. "Settings" is
clipped.

### 2.2 Touch-input failures

**Three controls are revealed only on `:hover`, and all three stay hit-testable while
invisible** (`opacity: 0` does not remove pointer events — verified: computed
`pointer-events: auto`). On a touch device they are undiscoverable but still tappable,
which is the worst of both:

| Control | Rule | Measured box |
|---|---|---|
| deck overflow menu `⋯` | `.deck:hover .deck-menu__trigger` (`FlashcardsView.css:432`) | 22 × 22 |
| take-deck-off-table `✕` | `.chip:hover .chip__x` (`:813`) | 19 × 19 |
| remove-card-from-deck `✕` | `.entry:hover .entry__remove` (`:1494`) | 17 × 17 |

The deck menu is the *only* non-drag route to "Put on the table", "Rename", "Duplicate",
"Delete" and "View cards" — so on touch, five deck operations hide behind an invisible
22px button.

**Tap targets are below both platform minimums** (44 × 44 iOS HIG, 48 × 48 Material).
Measured: rail toggle 28 × 28, "+ New" 52 × 24, prompt-mode segment 70 × 27, Filters pill
81 × 31, level-filter chips 36 × 22 (seven of them), card filing handle 26 × 26. Only the
grade buttons (71 × 50) and Reveal (137 × 40) are close to acceptable.

**The chart resizer is mouse-only.** `SoundsView.tsx:163` `startDetailResize` binds
`mousedown`/`mousemove`/`mouseup` and the handle is a 6px-wide `col-resize` strip — no
touch path at all, and 6px is untappable regardless.

**Outside-press dismissal is mouse-only.** `useDismissOnOutside` listens on `mousedown`
only. iOS Safari synthesises `mousedown` for taps on some elements but not reliably on
non-interactive ones, so popovers can be left open by a tap outside.

**`touch-action: none` traps scrolling.** Set on `.deck`, `.chip` and `.entry`. On desktop
these sit in a narrow rail; at ≤860px the rail becomes a wrapping row of 174px deck cards
that can fill much of a phone screen, and a touch that starts on one cannot scroll the
page. `.entry--in-deck` already solves this with `touch-action: pan-y` and a comment
explaining why — the same reasoning applies to the other three at phone width.

### 2.3 Drag-and-drop

Better than feared. The engine (`decks/dnd/useDeckDrag.ts`) is hand-rolled on **pointer
events**, not HTML5 DnD, and its comment already notes the native API "behaves
inconsistently on touch". `pointercancel` is treated as a clean abort. So drags do
physically work under a finger today.

What does not work is the *interaction model*. Drag starts immediately after 5px of travel
(`DRAG_THRESHOLD_PX`), which on a coarse pointer is indistinguishable from the start of a
scroll — hence the `touch-action: none` that then breaks scrolling. And per ADR-0021 the
non-drag escape hatch is *keyboard* (`Space` to lift, arrows to move); phones have no
keyboard, and the rail's own hint text says so out loud: "Drag a deck onto the table…
By keyboard: focus a deck, `Space` to lift…".

### 2.4 iOS-specific hazards already in the code

- `.app { height: 100vh }` (`App.css:4`) — under Safari's collapsing toolbar `100vh` is the
  *large* viewport, so the bottom of the app sits under browser chrome.
- **No `env(safe-area-inset-*)` anywhere, and no `viewport-fit=cover`.** `.toasts` is
  `position: fixed; bottom: 16px` — on a notched device in a home-screen PWA that lands on
  the home indicator.
- Audio: `useAudioPlayer` creates the `HTMLAudioElement` lazily and calls `play()`
  synchronously inside the click handler. That is exactly what iOS requires; it is a
  constraint not to regress (never `await` a fetch before `play()`). Separately, iOS routes
  `<audio>` through the ringer switch — a learner with silent mode on hears nothing.
- **Storage eviction is the real iOS risk.** Decks live in `localStorage`
  (`decks/storage.ts`, key `teochew-dictionary:decks/v1`) and SRS card state in IndexedDB
  (`srs/db.ts`, `teochew-flashcards`). Safari's ITP deletes all script-writable storage
  after 7 days without site interaction. A learner who takes a fortnight off loses their
  entire review history. **Home-screen-installed web apps are exempt from that sweep.**

### 2.5 Payload

`dist/dict.json` is **41 MB decoded / 2.5 MB gzipped**, 16,245 entries, fetched whole on
every cold load and parsed before the dictionary or flashcards render. Measured JS heap
after load and a search in desktop Chrome: **60–80 MB**. That is survivable on a laptop;
on a mid-range phone it is the difference between a tab that stays warm and one that gets
evicted and reloads on every app switch. It has not been measured on real hardware, and it
should be before anyone concludes it is fine.

---

## 3. Design

### 3.1 Breakpoints

Consolidate the three ad-hoc breakpoints to two, documented in `index.css`:

- **phone** — `max-width: 640px`: one pane at a time, bottom tab bar, sheets not panels.
- **tablet** — `max-width: 1024px`: two panes, condensed chrome, side panels survive.
- above that: today's desktop layout, unchanged.

The existing 620px `.sound-row` rule folds into 640; the 860px flashcards rule becomes the
tablet tier; the 1100px drawer-hint rule folds into tablet.

### 3.2 Shell

- `height: 100vh; height: 100dvh` on `.app` (declaration order gives the fallback free).
- `<meta name="viewport" … viewport-fit=cover>` plus `env(safe-area-inset-*)` padding on
  the header, the bottom bar and `.toasts`.
- **Phone: move navigation to a bottom tab bar.** Four equal-width targets, ≥48px tall,
  plus the bottom safe-area inset. This fixes the 59px horizontal overflow, puts navigation
  in the thumb zone, and matches what a four-section app looks like on both platforms. The
  header shrinks to a compact title row (or disappears on scroll).
  Keep them as real `<a href="#tab">` elements — the Cmd/middle-click behaviour from
  issue #156 must survive the move.

### 3.3 Dictionary — one pane at a time

Below 640px the list and the detail become two screens rather than two panes: list by
default, tapping an entry pushes the detail full-width with a back affordance.

Route the selection through the hash rather than component state. `selectedId` is
`useState` today, so a phone's back gesture would leave the app entirely instead of
returning to the list. Extend `tabFromHash` to parse `#dictionary/<entry-id>`, which gets
three things at once: working back, no new routing dependency, and **shareable deep links
to an entry** — worth having on desktop too.

Collapse the three checkboxes and the two `select`s behind a single "Filters" disclosure so
the list starts near the top of the screen; today they consume 200px before the first
result.

### 3.4 Flashcards — card-first

The card gets the screen; everything else gets out of the way.

- **Rail → off-canvas drawer.** `.rail--closed` already exists as a 52px strip; at phone
  width make it a true off-canvas panel with a scrim, opened from a "Decks" button. It must
  not stack above the card.
- **Table → one-line strip.** Collapse "on the table" to a summary line
  (`16,244 in play · 20 to review`) that expands on tap into the chip tray.
- **Bar → one compact row.** Prompt mode as a horizontally scrollable segmented control;
  Filters and Add cards as pills.
- **Study fills the remainder**, card centred, grade buttons in a fixed thumb-reachable row
  above the tab bar.
- **Browse drawer → bottom sheet.** `max-height: min(268px, 45vh)` is unusable at phone
  height; make it a sheet at ~85% height with a drag/close handle.

### 3.5 Touch parity for every drag

Three changes, in order of importance:

1. **Every drag action gets a tap equivalent.** The pieces mostly exist — `DeckMenu` covers
   put-on-table/rename/duplicate/delete/view-cards, `EntryDeckMenu` covers filing a card
   into a deck. What is missing is a *visible trigger*. See 3.6.
2. **Long-press to lift on coarse pointers.** Under `(pointer: coarse)`, require a ~250ms
   press before the drag arms, instead of 5px of travel. That is the platform idiom, and it
   is what lets the `touch-action` fix below be safe.
3. **`touch-action: pan-y`** on `.deck`, `.chip` and `.entry` at phone width, matching what
   `.entry--in-deck` already does — vertical scroll keeps working, and a `pointercancel`
   from a scroll take-over is already handled as a clean abort.

This extends ADR-0021's "keyboard parity" principle to touch: *no action may be reachable
only by dragging.*

### 3.6 Touch affordances

- **Retire hover-only reveals.** Make the three controls visible by default and wrap only
  the *hiding* in `@media (hover: hover) and (pointer: fine)`. Precise-pointer users keep
  today's clean look; touch users get controls that exist.
- **44 × 44 minimum hit box** on every control, inflated via padding or a `::after`
  overlay rather than by growing the visual — the dense look of the flashcards screen is
  deliberate and should survive.
- **`useDismissOnOutside`: `mousedown` → `pointerdown`.** One-line fix, covers both input
  types; the "press inside, release outside" rationale in its comment still holds.

### 3.7 Sounds

- `.sounds-view__controls` wraps; sort moves to its own row as a segmented control. This
  alone makes chart mode reachable.
- Chart mode at phone width: grid takes the full width, the cell detail becomes a bottom
  sheet.
- Hide the resizer below the tablet breakpoint — there is nothing to resize once the detail
  is a sheet, which also disposes of the mouse-only handler. (If it is ever kept at tablet
  width on a touch screen, port it to pointer events.)

---

## 4. iOS and Android

### Recommendation: responsive web app, installable as a PWA. No native wrapper.

**Nothing in the app needs a native capability.** Storage is IndexedDB plus localStorage;
audio is `<audio>` against remote URLs; the only recording path (`RecordClipButton`) is
gated to the dev server by design (ADR-0017) and never ships. A Capacitor shell would wrap
the same web view around the same code and add a build target, a signing story, a review
cycle and $99/yr — and Apple's guideline 4.2 specifically rejects apps that are a website
in a wrapper.

The one plausible future driver for going native is **push notifications for review
reminders** — and iOS has supported Web Push since 16.4 *for home-screen-installed web
apps*. So even that is reachable without leaving the web.

**The strongest argument for installing is not offline — it is storage durability.** As in
2.4, Safari's ITP wipes IndexedDB and localStorage after 7 days of no interaction, and
home-screen web apps are exempt. For an SRS app whose entire value is accumulated review
history, that is the difference between a tool and a toy. Two consequences:

- The install prompt should be framed to the user as *"keep your review history"*, not
  *"work offline"*.
- **Ship export/import of decks and SRS state regardless.** Install status is not something
  the app can guarantee, and a JSON export is cheap insurance against eviction, a lost
  phone, or a switch of browser. This is worth doing even before the PWA work.

### PWA design

- **Manifest** generated with the same `base` logic as `vite.config.ts` — `start_url` and
  `scope` must be `/teochew-dictionary/` on Pages and `/` in dev. Hardcoding either breaks
  the other.
- **Icons.** 192, 512, and a 512 `maskable` for Android adaptive icons. Plus a 180 × 180
  `apple-touch-icon` PNG: iOS ignores manifest icons for the home-screen icon, and today's
  inline-SVG favicon gives it nothing to use. `display: standalone`.
- **Theme colour.** The manifest takes one value but the app is light/dark aware, so also
  emit two `<meta name="theme-color" media="(prefers-color-scheme: …)">` tags.
- **Service worker: precache the shell only.** JS, CSS, HTML and the inlined font — a few
  hundred KB. **Do not automatically cache `data/dict.json`**: writing 40 MB to someone's
  phone without asking is hostile, and it is a large share of a constrained iOS quota.
  Instead, Settings gets an **"Available offline"** toggle that names the size and does the
  caching on request.
- **Do not cache audio in v1.** Clips are cross-origin GitHub Release assets (ADR-0014), so
  responses are opaque: you cannot check status, and they count against quota at padded
  size. If offline audio matters later, the honest fix is re-hosting clips under the Pages
  origin, which is a separate decision.
- **Update path.** A precached shell with no update flow strands users on a stale build
  forever. Prompt on a waiting worker, or activate on next navigation — decide explicitly.
- **Use `vite-plugin-pwa` (Workbox), not a hand-rolled worker.** This cuts against the
  project's stated preference for small hand-written implementations (ADR-0020, ADR-0021),
  so it should be recorded as a deliberate exception: the precache manifest has to be
  generated from hashed build output, and hand-rolled cache invalidation is a
  well-known way to brick a static site. Worth its own ADR.

### Android

Chrome installability needs only manifest + service worker + icons. `beforeinstallprompt`
gives a real install button — put it in Settings rather than a nag banner. Audio needs a
user gesture, which every clip already has.

### iOS quirks, collected

| Quirk | Impact | Handling |
|---|---|---|
| ITP 7-day storage eviction | loses decks + SRS history | install to home screen; export/import as backup |
| No `beforeinstallprompt` | no install button possible | detect iOS Safari, show Share → Add to Home Screen instructions |
| `100vh` ≠ visible height | bottom of app under toolbar | `100dvh` with `100vh` fallback |
| Safe areas in standalone | toasts/tab bar under the home indicator | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| `<audio>` obeys the ringer switch | silent-mode users hear nothing | known issue; a Web Audio path would bypass it — low priority |
| `play()` must be in the gesture | clips silently fail | already correct in `useAudioPlayer`; do not add an `await` before `play()` |

---

## 5. Follow-up issues

Ordered so each is independently shippable and reviewable.

| # | Issue | Size | Depends on |
|---|-------|------|-----------|
| 1 | **Responsive foundation** — breakpoint tokens, `100dvh`, `viewport-fit=cover` + safe-area insets, phone bottom tab bar, remove horizontal overflow | S | — |
| 2 | **Touch affordance sweep** — retire hover-only reveals behind `(hover: hover)`, 44px minimum hit boxes, `useDismissOnOutside` → `pointerdown` | S | — |
| 3 | **Dictionary single-pane** — list ↔ detail push, hash-routed selection (`#dictionary/<id>`), collapsed filters. Also delivers entry deep links | M | 1 |
| 4 | **Sounds phone layout** — wrapping controls row, full-width chart with detail as a bottom sheet, hide the mouse-only resizer below tablet | M | 1 |
| 5 | **Flashcards card-first layout** — off-canvas rail, collapsed table strip, compact bar, sheet browse drawer | L | 1 |
| 6 | **Touch drag parity** — long-press lift on coarse pointers, `pan-y`, a visible tap route for every drag action | M | 2, 5 |
| 7 | **Export/import decks and SRS state** — JSON round-trip, guards against ITP eviction and device loss | S–M | — |
| 8 | **PWA: manifest, icons, service worker, install affordance** (incl. iOS Add-to-Home-Screen instructions and an update path) | M | 1 |
| 9 | **Offline data opt-in** — Settings toggle that caches `dict.json`, showing its size | M | 8 |
| 10 | **Investigate `dict.json` payload and parse cost on real devices** — 39 MB decoded / 2.42 MB gzipped as of §6's re-check, 60–80 MB heap on desktop; measure on a mid-range phone before deciding whether to split into a light index plus lazy entries. §6 has what could be checked without a device — the device measurement itself is still open. | Investigation | — |
| 11 | **ADR: responsive PWA over a native wrapper**, and the `vite-plugin-pwa` exception to the hand-rolled-implementations preference | S | 8 |

Issues 1 and 2 are worth doing first regardless of everything else: together they are a few
hours of CSS and remove the failures that make the app feel broken rather than merely
cramped.

## 6. `dict.json` payload — investigation findings (issue #10)

This environment has no real phone and no browser automation, so the actual ask —
cold-load time and heap on a mid-range Android device — is **still not done** and stays
on the device-test checklist below. What follows is what could be checked without one,
so the real measurement starts from current numbers rather than the ones in §2.5, which
already look slightly stale.

**Current size**, measured directly rather than carried over: `dict.json` is **39 MB
decoded / 2.42 MB gzipped**, 16,245 entries — both numbers moved slightly since §2.5's
audit (41 MB / 2.5 MB), as the dataset does with ongoing edits. Re-check before acting on
either figure.

**Parse cost, desktop-Node proxy.** `fs.readFileSync` + `JSON.parse` of the file on the
machine this was written on (Apple Silicon, unthrottled): read 43 ms, parse 81 ms, V8 heap
128.6 MB / RSS 292.3 MB immediately after. This is *not* the number that matters — it
skips fetch/decode overhead, and skips everything the app does after parsing (building the
Fuse.js search index, which is most of the 60–80 MB desktop-Chrome figure in §2.5). It's
only useful as a floor: a mid-range phone's CPU is commonly 3–10× slower single-threaded
than a current desktop, and its memory budget is far tighter, so real hardware should be
assumed worse than this in both dimensions until measured otherwise.

**What the real investigation still needs**, unchanged from §6: cold-load time, peak
heap, and whether the tab survives an app switch, on an actual mid-range Android device.
Chrome DevTools' CPU/network throttling on a desktop would be a reasonable middle ground
if a real device stays unavailable — closer to real conditions than the unthrottled
number above, though still not a substitute for it.

**Given what's known so far**, prototyping a light-index-plus-lazy-entries split seems
worth doing regardless of the exact numbers that come back — the file is large enough,
and phones constrained enough, that the direction is unlikely to be wrong even if the
magnitude turns out smaller than feared. But this issue should stay open and tracked
until someone can actually run the device-test checklist below; treat that as blocking
the decision, not this write-up.

## 7. Device-test checklist

Emulated viewports caught everything above, but these need real hardware:

- iOS Safari and an installed home-screen instance: safe areas, `dvh` behaviour under the
  collapsing toolbar, audio with the ringer switch both ways, storage survival across a
  week of no use.
- Android Chrome: install flow, `beforeinstallprompt`, audio.
- A mid-range Android device: cold-load time and memory for `dict.json`, and whether the
  tab survives an app switch.
- Long-press drag on both, including a drag that begins as a scroll.
