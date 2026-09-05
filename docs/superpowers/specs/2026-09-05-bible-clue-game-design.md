# Bible Clue Game — Design

**Date:** 2026-09-05
**Status:** Awaiting review

## 1. What this is

A five-clue guessing game about Bible characters, run by a moderator on an iPad
and screen-shared into a Google Meet. The moderator reveals clues one at a time;
the group calls out guesses; the moderator marks the round won or lost, an
effect plays, the answer is shown, and the next round begins.

Two programs are being built:

- **The player** — a single self-contained HTML file, hosted once and installed
  to the iPad's home screen. This is what the group sees.
There is **no separate builder**. A standalone authoring tool was specified and
planned, then dropped on 2026-09-05 before implementation: everything it was to
do fits inside the player's own editor screen, on the device where the game is
actually run. See §8.

### Scoring rules (shown on the title screen)

Guess by clue 1 for 5 points, clue 2 for 4, clue 3 for 3, clue 4 for 2, clue 5
for 1. The game *displays* the current value but does not track scores; see
§10.

## 2. Constraints, and what was verified

| Constraint | Status |
|---|---|
| Moderator uses an iPad with a Bluetooth keyboard | Given |
| Presented via Google Meet screen share | Given |
| Content changes weekly, prepared on a PC | Given |
| No Swift, no App Store, no native app | Given |
| No npm dependency chain; Node and Python are available locally | Given |

Two findings from a throwaway diagnostic (`ipad-test.html`) run on the actual
iPad on 2026-09-05:

1. **JavaScript does not execute in the iPadOS Files app preview.** Quick Look
   renders the markup and refuses to run scripts. Opening a game file directly
   from a USB drive is therefore impossible, and this is settled, not suspected.
2. **The USB transfer path itself works.** The PC wrote to the SanDisk drive and
   the iPad's Files app read from it. Only script execution failed.

Two consequences shape everything below:

- The player must be reached over HTTPS and installed via **Add to Home Screen**.
  That is also the only way to get true fullscreen on iPadOS, which matters
  because iPadOS screen-shares the *entire screen* — any browser chrome is
  broadcast to the meeting and eats the top of the frame.
- Weekly content cannot arrive as a file that is opened directly. It must be
  loaded *into* the already-installed app. See §7.

### Design consequences of Google Meet

Meet re-encodes the shared screen at low bitrate and often a reduced frame rate.
This is a real design constraint, not a footnote:

- **Effects must be chunky, slow, and few.** Large particles (radius 6–14 px),
  moderate counts, and a 2.5–4 s hold. Fine fast confetti becomes grey mush on
  the receiving end — it looks great to the moderator and terrible to everyone
  else, which is exactly backwards.
- **Backgrounds must be flat or near-flat.** Smooth gradients band badly under
  video compression.
- **Text must be bold rather than merely large.** Weight survives compression;
  thin large text does not.
- **Layout targets 16:9**, since that is what Meet transmits.

## 3. Storage note specific to iOS

An installed home-screen web app has **storage completely separate from Safari's**,
even at the identical URL. Anything that updates content must therefore happen
*inside* the installed app. Schemes that rely on opening a link — for example
encoding a week into a URL fragment and emailing it — will write to Safari's
storage and the installed app will never see it. This ruled out an otherwise
attractive option and is recorded here so it is not re-proposed.

## 4. Data model

A week is one JSON object. This is the unit that is embedded in the player,
stored in `localStorage`, and exported to disk by the editor.

```json
{
  "formatVersion": 1,
  "id": "2026-09-13",
  "title": "September 13",
  "theme": {
    "background": "slate",
    "backgroundImage": null,
    "winEffect": "fireworks",
    "loseEffect": "ashfall"
  },
  "rounds": [
    {
      "answer": "Rebekah",
      "clues": [
        "An answer to prayer",
        "Animal lover",
        "Stay hydrated",
        "Born when their spouse almost died",
        "Eavesdropper"
      ]
    }
  ]
}
```

- `formatVersion` — integer, lets a future player read an old week file.
- `id` — unique string, used as the `localStorage` key. Date-based by default.
- `backgroundImage` — `null`, or a `data:` URI. Not settable from the editor; reserved for a hand-authored week file.
- `rounds[].clues` — exactly 5 strings in reveal order, vague → obvious.

Rounds are played in the order given. No shuffling; clue order is authored and
matters.

## 5. The player

### 5.1 Screen states

```
TITLE ──space──▶ CLUES ──y──▶ RESOLVED(win) ──down──▶ next CLUES … ──▶ END
                   │                                                    │
                   ├──space──▶ CLUES (k+1, stops at 5)                  │
                   └──n (k=5 only)──▶ RESOLVED(lose) ──down──▶ …        │
                                                                        │
  TITLE ◀────────────────────── space ─────────────────────────────────┘
```

**TITLE** — the rules and the scoring table, plus "Press space to begin". This
exists so the moderator can start screen-sharing, get everyone settled, and read
the rules aloud before any clue is on screen.

**CLUES** — round *n*, with *k* clues visible (k = 1…5). The round opens with
clue 1 already showing.

**RESOLVED** — the answer is revealed and the win or lose effect plays. The
screen holds here indefinitely until the moderator advances. The effect fires
once on entry only, never on re-entry via `←`.

**END** — all rounds played. Offers a restart.

### 5.2 Input map

Every action has a key and a touch equivalent, because the keyboard may not
always be attached and the moderator may be holding the iPad.

| Action | Keys | Touch |
|---|---|---|
| Reveal next clue | `Space`, `→` | Tap right 70% of screen |
| Go back | `←`, `Backspace` | — |
| Guessed correctly | `Y` | Green check button |
| Nobody guessed | `N` *(only when k = 5)* | Red X button |
| Next round | `↓` | Full-width "Next" bar |
| Open content editor | `E` | Triple-tap top-left corner |

Notes:

- At k = 5, further advance presses do nothing. No wrap, no beep, no visual
  reaction.
- **Debounce:** advance actions ignore `event.repeat`, and ignore any repeat
  input within 250 ms. Held-down keys must not blow through all five clues.
- The editor is reachable only from `TITLE` and `END`, never mid-round.

**Go back is available in every state**, because moderators fat-finger and there
must always be a way out of a mis-press:

| From | `←` goes to |
|---|---|
| `CLUES` at k > 1 | `CLUES` at k − 1 |
| `CLUES` at k = 1, round > 1 | the previous round's `RESOLVED`, effect **not** replayed |
| `CLUES` at k = 1, round 1 | `TITLE` |
| `RESOLVED` | `CLUES` at k = 5 of the same round, effect **not** replayed |
| `END` | the final round's `RESOLVED`, effect **not** replayed |
| `TITLE` | nothing — there is nowhere earlier to go |

Re-entering `RESOLVED` by going back shows the answer without firing the effect
again. Replaying fireworks on a correction would read as a second win.

### 5.3 Layout

Single 16:9 stage, centered, letterboxed on other aspect ratios.

```
┌─────────────────────────────────────────────────────┐
│  Round 3 of 7                        Worth 4 points │
│                                                     │
│      1.  A foreigner                                │
│      2.  Refused to go home                         │
│      3.  Slept at the palace door                   │
│      ·                                              │
│      ·                                              │
│                                                     │
│   [ ✓ ]                                     [ ✗ ]   │
└─────────────────────────────────────────────────────┘
```

- **All five clue slots are reserved from the start of the round**, holding
  invisible placeholders. Nothing shifts position as clues appear — this is what
  "same location each time" requires.
- Clue reveal is a 200 ms fade and 12 px rise. Short on purpose: long animations
  smear under compression.
- The point counter reads 5 → 1 as clues appear.
- The green check is live from clue 1 — the rules explicitly reward locking in
  early. The red X is rendered but **disabled and dimmed** until clue 5, so it
  never shifts position.
- On `RESOLVED`, the clue list dims back and the answer displays large and
  centered over it.

### 5.4 Type and color

- System font stack only — `-apple-system, BlinkMacSystemFont, "Segoe UI",
  system-ui, sans-serif`. No web fonts: they would require the network, and the
  app must work offline.
- Clue text `clamp(22px, 4.2vh, 44px)`, weight 600.
- Answer `clamp(40px, 10vh, 110px)`, weight 800.
- Every background pairs with a foreground that clears WCAG AA at these sizes.

### 5.5 Backgrounds

Eight flat presets, each a `{ bg, fg, accent, dim }` token set: Slate, Ink,
Parchment, Deep Teal, Plum, Forest, Charcoal, Sand. Flat fills, no gradients
(see §2).

A custom image is possible by hand-editing a week file's `backgroundImage` into
a `data:` URI; the stage applies a darkening scrim automatically so clue text
stays legible. No interface offers this, and flat colours are the recommendation
regardless (see §2).

### 5.6 Effects

One canvas particle engine with eleven presets layered over it. No third-party
library: every failure effect would have to be hand-written regardless, and once
the engine exists an inlined dependency is redundant weight in a file that should
stay readable.

The engine is a single emitter loop over `{x, y, vx, vy, radius, color, life,
shape}` particles with gravity, drag, and alpha fade. A preset is **data, not
code** — an emitter shape, a particle count, a size range, a palette, and a
duration. Adding a twelfth preset later is a table entry, not a new module.

**Win effects (6)**

| Preset | Description |
|---|---|
| `fireworks` | Three or four bursts fired in sequence from random points in the upper half. The default. |
| `cannons` | Two angled jets of ribbon-shaped confetti from the lower corners. |
| `starburst` | One large radial burst originating from the answer text itself. |
| `goldenrain` | Large slow gold discs tumbling down the full width. |
| `shockwave` | Two or three expanding concentric rings, with a sparse spark field trailing each. |
| `streamers` | Long ribbons that tumble and flutter as they fall — the chunkiest option, and the most compression-tolerant. |

**Lose effects (5)**

| Preset | Description |
|---|---|
| `ashfall` | Slow grey flakes drifting for about six seconds over a dimmed screen. The default. |
| `deflate` | The answer sinks a few pixels, the screen desaturates, a red vignette closes in, and the stage shakes briefly. |
| `shatter` | The answer breaks into angular fragments that fall and rotate. |
| `iris` | A dark vignette closes inward until only the answer remains lit. |
| `downpour` | Heavy dark-blue streaks falling at a slant. |

Constraints every preset obeys:

- Particle radius 6–14 px, so nothing dissolves into mush under Meet's encoder.
- At most 250 live particles at once, to hold frame rate on the iPad.
- Total duration 2.5–7 s, then the screen settles and holds on the answer.
  The upper bound was raised from 4 s on 2026-09-05: effect *length* is not
  what video compression punishes — particle size and speed are — and the
  ashfall was blinking out while people were still reading it.
- No preset relies on fine detail, rapid strobing, or subtle color shifts, all of
  which compression destroys.
- `prefers-reduced-motion` substitutes a simple fade for any preset.

## 6. Content parsing

The editor accepts the week's list pasted **exactly as it arrives by email**, so
no reformatting is needed. The format in the source sample separates the
character's name from its clues with a blank line, which means the name arrives
as a block of its own:

```
Rebekah

An answer to prayer
Animal lover
Stay hydrated
Born when their spouse almost died
Eavesdropper
```

Rules:

- Blocks are separated by one or more blank lines. Lines containing only
  whitespace count as blank — the source emails use lines holding a single
  space, not truly empty lines.
- Leading and trailing whitespace is stripped from every line.
- A block that is a rules preamble (its first line starts with "Rules") or a
  scoring table (every line ends in "point"/"points") is dropped.
- **A one-line block is a character name.** Its clues are the following block,
  provided that block has two or more lines. If it does not, the name has no
  clues and is skipped with a warning.
- **A block of two or more lines that was not claimed as clues** is treated as a
  name plus its clues together, supporting the variant where no blank line
  separates them.

This two-shape rule was not a guess: the single-shape version failed against the
real week-one email on 2026-09-05, and `test/parser.test.js` pins the real text
so it cannot regress.

Warnings, shown but never blocking:

- a block with fewer or more than 5 clues, naming the block;
- a duplicate answer;
- zero parsed rounds.

The parser is a pure function with no DOM dependency, so it can be tested
directly.

## 7. Weekly content updates

The player always ships with an embedded week, so it works standing alone even
with empty storage. Two ways to load a new one, both from inside the installed
app:

1. **Paste** — the editor screen has a large text box. Paste the week's list,
   the same parser from §6 runs, a preview appears, save commits it. This path
   has no dependencies and always works.
2. **Load from file** — a file picker reads a `.json` week file, including one
   on the SanDisk drive, whose transfer path is now proven (§2). Cheaper than
   pasting when a week file already exists.

Storage layout in `localStorage`:

- `bibleClueGame.weeks` — array of week objects, most recent last, **capped at
  10** with the oldest dropped.
- `bibleClueGame.activeWeekId` — which one loads on launch.

Keeping a history means re-running an earlier week costs one tap. On launch the
player uses the active stored week if present, otherwise the embedded one. If
storage is unavailable or corrupt, it falls back to the embedded week rather
than showing an error.

Re-uploading the whole app to the host remains possible but is never required
for a content change.

## 8. Authoring a week

All authoring happens **inside the game**, on the screen reached with `E` or a
triple-tap in the top-left corner. It is available from the title and end
screens only, never mid-round.

The screen offers, in order:

1. **A name.** Free text. The storage key is derived from it, so saving again
   under the same name replaces that week rather than leaving a near-duplicate.
   Left blank, it falls back to the next Sunday's date.
2. **The list**, pasted exactly as the email arrives (§6), with a running count
   of what parsed and any warnings, updated on every keystroke.
3. **A background**, chosen from the eight flat palettes rendered as swatches in
   their own colours.
4. **A preview** — a 16:9 panel showing a real mid-round screen through the
   game's own renderer, so it cannot drift from what the iPad displays.
5. **A win effect** and **a fail effect**, six and five cards respectively, each
   with a play button. Choosing one also plays it.
6. **Use this week**, **Export file**, **Load a file**, **Close**, and a list of
   saved weeks to switch between or delete.

**Effect previews step the editor aside** and play at full size on the real
stage, against the chosen background and a real answer. A shrunken preview would
say nothing useful about how an effect survives Meet's compression, which is the
only question worth asking about it.

**The two effect pickers are built from separate lists**, so no interface path
can select `ashfall` for a correct answer. `weekFromEditor` validates the same
constraint again for hand-edited files.

**Export** writes `<name>.json`. It exists because deleting the home-screen app
wipes its storage, so without it there is no backup of a week's content; it also
makes a week portable between the PC's browser and the iPad.

### Why there is no separate builder

A standalone `builder.html` was specified here and fully planned. It was dropped
before implementation once the player shipped with a working editor:

- Background and effects live inside a week's `theme`, so a week file already
  carries everything the builder would have set.
- Authoring on the iPad is where the game is actually run, so a PC-only tool
  added a device hop rather than removing one.
- Embedding the player inside a builder to preview it would have gone stale on
  every player change.

The plan for it was deleted rather than left in `docs/` to go stale.

## 9. Source layout, build, and testing

A single 1,200-line HTML file is painful to work in, so the sources are split and
a small build step inlines them. The build script is Python 3, standard library
only — no npm, no lockfile, no dependency drift on a project that gets touched
once a week.

```
src/player/{index.html, style.css, game.js, effects.js, parser.js, weeks.js}
src/data/week-2026-09-13.json      # the sample content, as the default embed
build.py                            # inlines everything
dist/{index.html, sw.js, icon-180.png}   # the shipped artifacts
test/{parser.test.js, machine.test.js}
```

`parser.js` and the state machine in `game.js` are written as pure,
DOM-independent modules specifically so they can be tested headlessly with
`node --test` (Node 24 is present). Following TDD, those tests are written
before the implementations.

- **Parser tests** — the real sample email from week one, blocks with wrong clue
  counts, ragged whitespace, a rules preamble, empty input.
- **State machine tests** — key sequences as input, expected state as output:
  advance stops at clue 5; `N` is rejected before clue 5; debounce suppresses a
  repeat within 250 ms; the last round leads to `END`. Every row of the go-back
  table in §5.2 gets its own case, including the two that cross a round boundary,
  and each asserts that re-entering `RESOLVED` does **not** re-fire the effect.
- **Manual iPad checklist** — re-run `ipad-test.html` from the installed app's
  origin to confirm fullscreen in standalone mode, capture the Bluetooth
  keyboard's key codes, and measure sustained particle frame rate. Then one
  full dry run of a real week over a Google Meet with a second participant
  confirming the effects read correctly after compression.

## 10. Out of scope

Deliberately excluded, to be reconsidered only if asked for after real use:

- **Scorekeeping** — no player names, no running totals, no tiebreaks. A
  whiteboard does this better, and it would multiply the size of the app.
- Timers or countdowns.
- Sound. Audio over a Meet screen share is unreliable and rarely wanted.
- Multiple simultaneous moderators, or any network sync between participants.
- A separate presenter view. iPadOS shares the whole screen, so a second window
  would be broadcast too.
- Analytics of any kind.

## 11. Open risks

| Risk | Handling |
|---|---|
| File picker may misbehave inside an installed iOS web app | The paste path (§7.1) is unconditional and needs no picker. Confirm during the manual checklist; if broken, drop the picker and lose nothing essential. |
| Fullscreen behavior in standalone mode not yet measured | `ipad-test.html` answers this once the app is hosted. Add to Home Screen alone should suffice; the Fullscreen API is a bonus. |
| Effects may still read poorly after Meet compression | Parameters are data, not code. The dry run with a second participant is scheduled before first live use, and tuning is a constant change. |
| Host choice not yet made | Netlify Drop recommended for drag-and-drop with no CLI; Cloudflare Pages equivalent; GitHub Pages works but is openly public. One-time decision, does not affect any code. |

## 12. Build order

1. Player first — it has a weekly deadline, and week one's content can be
   hand-entered in a minute from the sample already supplied.
2. Host it, install it on the iPad, run the manual checklist.
3. The editor grew to cover authoring; no second program was built.
