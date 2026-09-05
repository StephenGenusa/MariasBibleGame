# Bible Clue Game — Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-contained HTML game the moderator installs on an iPad and screen-shares into Google Meet — five clues revealed one at a time, a win or fail effect, the answer, then the next round.

**Architecture:** Small ES modules with the logic kept pure and DOM-free (`parser`, `machine`, `storage`) so it can be tested headlessly with Node's built-in test runner. A Python build script inlines every module, the stylesheet, and the week's JSON into one standalone `dist/index.html` with no network dependencies. Rendering is a one-way function of state: the reducer produces a state, the renderer draws it.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test` (Node 24), Python 3 stdlib for the build. **No npm packages at any point.**

**Spec:** `docs/superpowers/specs/2026-09-05-bible-clue-game-design.md`

**Scope:** This plan builds the **player** only. The builder (spec §8) is a separate subsystem and gets its own plan after a live week proves the data format.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **No npm dependencies, ever.** `package.json` exists solely to set `"type": "module"`. No `npm install` is ever run. No lockfile.
- **Node ≥ 24** for `node --test`. **Python 3, standard library only** for `build.py`.
- **No third-party or cross-origin requests, ever.** No CDNs, no web fonts, no external images, no analytics. All game code, styles and content live inside `dist/index.html`. Task 12 adds exactly two same-origin siblings — `sw.js` (offline caching, which cannot be inlined) and `icon-180.png` (the home-screen icon) — and nothing else may join them.
- **Fonts:** system stack only — `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- **Backgrounds are flat fills. No gradients** — they band under Google Meet's video compression.
- **Particle budget:** radius 6–14 px, at most 250 alive at once, effect duration 2.5–7 s.
- **Layout targets 16:9**, centered and letterboxed on other aspect ratios.
- **Text is bold rather than merely large.** Weight survives compression; thin large text does not.
- **Input map:** `Space`/`→` advance · `←`/`Backspace` go back · `Y` win · `N` fail (clue 5 only) · `↓` next round · `E` editor. **No `Enter`, no `PageUp`, no `PageDown`.**
- **`prefers-reduced-motion`** substitutes a simple fade for any effect.
- **No scorekeeping** of any kind (spec §10). The point *value* is displayed; nothing is tallied.
- Point value for clue `k` is `6 - k`.

## File Structure

```
package.json                    {"type": "module"} and nothing else
build.py                        inlines everything into dist/index.html
src/player/index.html           shell with three inline placeholders
src/player/style.css            layout, palette tokens, type scale
src/player/parser.js            pure: pasted text  -> rounds + warnings
src/player/machine.js           pure: state + action -> state
src/player/storage.js           localStorage week library
src/player/effects.js           canvas engine + 11 presets
src/player/render.js            state -> DOM
src/player/input.js             keys and taps -> actions
src/player/editor.js            paste/load content screen
src/player/main.js              wiring only
src/data/week-2026-09-13.json   week one, from the supplied sample
test/parser.test.js
test/machine.test.js
test/storage.test.js
dist/index.html                 the shipped artifact
```

`parser.js`, `machine.js`, and `storage.js` never touch the DOM. That is what makes them testable, and it is a hard rule, not a preference.

**Deviation from spec §9:** the spec put the state machine inside `game.js`. It is split into its own `machine.js` here so it can be imported by `test/machine.test.js` without dragging in DOM code, and `game.js` is replaced by the narrower `render.js` / `input.js` / `main.js` trio.

### Module load order

`build.py` concatenates modules in strict dependency order. Nothing may import "upward" in this list:

```
parser.js -> machine.js -> storage.js -> effects.js -> render.js -> input.js -> editor.js -> main.js
```

### Source conventions the build depends on

`build.py` inlines modules by stripping module syntax, so the sources must obey two rules or the build fails loudly:

1. **All `import` statements appear at the top of the file** and reference only sibling modules (`./machine.js`). No bare or URL imports.
2. **Exports are written as `export function foo`, `export const foo`, or `export class Foo`.** No `export default`, no `export { a, b }` lists.

---
### Task 1: Scaffold and the build pipeline

Nothing else can be verified until a build exists, so this task ends with a real `dist/index.html` and a test that guards the three properties the shipped file must always have: no leftover placeholders, no surviving module syntax, and no external resources.

**Files:**
- Create: `package.json`
- Create: `build.py`
- Create: `src/player/index.html`
- Create: `src/player/style.css`
- Create: `src/player/{parser,machine,storage,effects,render,input,editor,main}.js` (empty stubs)
- Create: `src/data/week-2026-09-13.json` (a single placeholder round; real content lands in Task 10)
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `python3 build.py [week-file.json]` writes `dist/index.html`. Later tasks only add code to the stub modules; none of them modify `build.py`.

- [ ] **Step 1: Write the failing test**

```js
// test/build.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("build produces a self-contained player", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/index.html", "utf8");

  assert.ok(!/<!--INLINE:/.test(html), "an INLINE placeholder was left unreplaced");
  assert.ok(!/^\s*(import|export)\s/m.test(html), "module syntax survived inlining");
  assert.ok(!/(?:src|href)=["']https?:/.test(html), "the file references an external resource");
  assert.match(html, /id="game-data"/, "the embedded data block is missing");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `python3: can't open file 'build.py'`.

- [ ] **Step 3: Create the scaffold files**

`package.json` — this is the *entire* file. It declares ES module semantics for Node's test runner and nothing more. There are no dependencies and `npm install` is never run.

```json
{
  "name": "bible-clue-game",
  "private": true,
  "type": "module"
}
```

`src/data/week-2026-09-13.json` — a placeholder so the build has something to embed:

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
    { "answer": "Placeholder", "clues": ["one", "two", "three", "four", "five"] }
  ]
}
```

Create the eight module stubs, each containing only a comment naming its responsibility, e.g. `src/player/parser.js`:

```js
// Pasted week text -> rounds and warnings. No DOM access, ever.
```

`src/player/style.css` may be empty for now; Task 6 fills it.

`src/player/index.html` — the shell. Note that this file is *not* the artifact; `dist/index.html` is.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#12141a">
<title>Bible Clue Game</title>
<!--INLINE:css-->
</head>
<body>
<div id="stage" aria-live="polite"></div>
<canvas id="fx" aria-hidden="true"></canvas>

<script type="application/json" id="game-data"><!--INLINE:data--></script>
<script type="module">
<!--INLINE:js-->
</script>
</body>
</html>
```

- [ ] **Step 4: Write `build.py`**

```python
#!/usr/bin/env python3
"""Inline every player source into a single self-contained dist/index.html.

Usage: python3 build.py [week-file.json]
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src" / "player"

# Strict dependency order. Nothing may import "upward" in this list.
MODULE_ORDER = [
    "parser.js", "machine.js", "storage.js", "effects.js",
    "render.js", "input.js", "editor.js", "main.js",
]

IMPORT_RE = re.compile(r"^[ \t]*import\s[^\n]*\n?", re.M)
EXPORT_RE = re.compile(r"^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)", re.M)
BAD_EXPORT_RE = re.compile(r"^export\s+(?:default\b|\{)", re.M)
PLACEHOLDER_RE = re.compile(r"<!--INLINE:\w+-->")


def read_module(name: str) -> str:
    """Strip module syntax so the file can be concatenated into one script."""
    path = SRC / name
    text = path.read_text(encoding="utf-8")

    if BAD_EXPORT_RE.search(text):
        sys.exit(f"{name}: `export default` and `export {{ ... }}` are unsupported; "
                 f"use `export function` / `export const` / `export class`")

    for match in IMPORT_RE.finditer(text):
        line = match.group(0).strip()
        if "./" not in line:
            sys.exit(f"{name}: only sibling imports are allowed, found: {line}")

    text = EXPORT_RE.sub("", IMPORT_RE.sub("", text))
    return f"/* ---------- {name} ---------- */\n{text.strip()}\n"


def main() -> None:
    week_name = sys.argv[1] if len(sys.argv) > 1 else "week-2026-09-13.json"
    week_path = ROOT / "src" / "data" / week_name
    if not week_path.exists():
        sys.exit(f"no such week file: {week_path}")

    week = json.loads(week_path.read_text(encoding="utf-8"))
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "\n".join(read_module(name) for name in MODULE_ORDER)

    if re.search(r"^[ \t]*(import|export)\s", js, re.M):
        sys.exit("module syntax survived inlining; check the source conventions")

    html = html.replace("<!--INLINE:css-->", f"<style>\n{css}\n</style>")
    html = html.replace("<!--INLINE:data-->", json.dumps(week, ensure_ascii=False, indent=2))
    html = html.replace("<!--INLINE:js-->", js)

    leftover = PLACEHOLDER_RE.search(html)
    if leftover:
        sys.exit(f"unreplaced placeholder: {leftover.group(0)}")

    out = ROOT / "dist" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)} ({len(html):,} bytes) from {week_path.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/build.test.js`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add package.json build.py src/ test/build.test.js dist/index.html
git commit -m "Add build pipeline that inlines the player into one file"
```

---

### Task 2: Content parser

Turns the week's email, pasted verbatim, into rounds. Pure function, no DOM.

**Files:**
- Modify: `src/player/parser.js`
- Test: `test/parser.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseWeekText(text: string) -> { rounds: Array<{answer: string, clues: string[]}>, warnings: string[] }`. Used by `editor.js` (Task 11) and, later, by the builder.

- [ ] **Step 1: Write the failing tests**

The first test uses the real sample supplied for week one, **including its quirk that the "blank" separator lines actually contain a single space**. That quirk is why the parser trims before testing for emptiness, and the test exists to keep it that way.

```js
// test/parser.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWeekText } from "../src/player/parser.js";

const SAMPLE = [
  "Rules: Slowly reveal five clues about a Bible character. Once you think you have the",
  "character, call out your name and lock in your answer.",
  " ",
  "By Clue 1--five points",
  "By Clue 2--four points",
  " ",
  " ",
  "Rebekah",
  " ",
  "An answer to prayer",
  "Animal lover",
  "Stay hydrated",
  "Born when their spouse almost died",
  "Eavesdropper",
  " ",
  "Elijah",
  " ",
  "Appeared out of nowhere",
  "Wanted to die under a plant",
  "Listen to me",
  "DoorDash",
  "450 vs 1",
  "",
].join("\n");

test("parses the supplied sample into rounds", () => {
  const { rounds, warnings } = parseWeekText(SAMPLE);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].answer, "Rebekah");
  assert.deepEqual(rounds[0].clues, [
    "An answer to prayer",
    "Animal lover",
    "Stay hydrated",
    "Born when their spouse almost died",
    "Eavesdropper",
  ]);
  assert.equal(rounds[1].answer, "Elijah");
  assert.equal(rounds[1].clues.at(-1), "450 vs 1");
  assert.deepEqual(warnings, []);
});

test("drops the rules preamble and the scoring table", () => {
  const { rounds } = parseWeekText(SAMPLE);
  assert.ok(!rounds.some(r => /^Rules/i.test(r.answer)), "rules block became a round");
  assert.ok(!rounds.some(r => /points/i.test(r.answer)), "scoring block became a round");
});

test("warns about the wrong number of clues but keeps the round", () => {
  const { rounds, warnings } = parseWeekText("Achan\n\nTribe of Judah\nConfessed");
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].clues.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Achan/);
  assert.match(warnings[0], /2 clues/);
});

test("warns about a duplicate answer", () => {
  const text = "Tamar\n\na\nb\nc\nd\ne\n\nTamar\n\nf\ng\nh\ni\nj";
  const { rounds, warnings } = parseWeekText(text);
  assert.equal(rounds.length, 2);
  assert.equal(warnings.filter(w => /more than once/.test(w)).length, 1);
});

test("skips a block that has an answer but no clues", () => {
  const { rounds, warnings } = parseWeekText("Lonely\n\nUriah\n\na\nb\nc\nd\ne");
  assert.deepEqual(rounds.map(r => r.answer), ["Uriah"]);
  assert.match(warnings.find(w => /Lonely/.test(w)), /no clues/);
});

test("warns when nothing at all parses", () => {
  const { rounds, warnings } = parseWeekText("   \n \n");
  assert.deepEqual(rounds, []);
  assert.match(warnings[0], /No rounds/);
});

test("tolerates CRLF, tabs and a null input", () => {
  const { rounds } = parseWeekText("Samuel\r\n\r\n\tAn answer to prayer\r\nDivided household");
  assert.equal(rounds[0].answer, "Samuel");
  assert.equal(rounds[0].clues[0], "An answer to prayer");
  assert.deepEqual(parseWeekText(null).rounds, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/parser.test.js`
Expected: FAIL — `The requested module '../src/player/parser.js' does not provide an export named 'parseWeekText'`.

- [ ] **Step 3: Implement the parser**

```js
// src/player/parser.js
// Pasted week text -> rounds and warnings. No DOM access, ever.

const CLUES_EXPECTED = 5;
const RULES_HEADING = /^rules\b/i;
const SCORING_LINE = /points?\s*$/i;

// A block is one or more non-blank lines. A line of only whitespace separates
// blocks: the source emails use lines containing a single space, not truly
// empty lines, so trim before testing.
function splitBlocks(text) {
  const blocks = [];
  let current = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      if (current.length) { blocks.push(current); current = []; }
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function isPreamble(block) {
  if (RULES_HEADING.test(block[0])) return true;
  return block.every(line => SCORING_LINE.test(line));
}

export function parseWeekText(text) {
  const warnings = [];
  const rounds = [];

  const blocks = splitBlocks(text).filter(block => !isPreamble(block));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.length === 1) {
      // The shape the source emails actually use: the character's name alone,
      // a blank line, then the clues as a block of their own.
      const next = blocks[i + 1];
      if (next && next.length >= 2) {
        rounds.push({ answer: block[0], clues: next });
        i++; // the clue block belongs to this round
      } else {
        warnings.push(`"${block[0]}" has no clues and was skipped.`);
      }
      continue;
    }

    // A block that already holds the name and its clues together.
    const [answer, ...clues] = block;
    rounds.push({ answer, clues });
  }

  for (const round of rounds) {
    if (round.clues.length !== CLUES_EXPECTED) {
      warnings.push(`"${round.answer}" has ${round.clues.length} clues, expected ${CLUES_EXPECTED}.`);
    }
  }

  const seen = new Set();
  for (const round of rounds) {
    const key = round.answer.toLowerCase();
    if (seen.has(key)) warnings.push(`"${round.answer}" appears more than once.`);
    seen.add(key);
  }

  if (rounds.length === 0) warnings.push("No rounds found. Check the pasted text.");
  return { rounds, warnings };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/parser.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/parser.js test/parser.test.js
git commit -m "Parse pasted week text into rounds with warnings"
```

---
### Task 3: State machine — forward transitions

The reducer is the whole game. Everything else draws it or feeds it. Pure, no DOM, no timers.

Note `justResolved`: it is `true` only on the single transition that resolves a round, and `false` on every other transition including a `BACK` into `RESOLVED`. Task 7's renderer fires the effect on `justResolved` and nothing else — this is what stops fireworks replaying when the moderator corrects a mis-press.

**Files:**
- Modify: `src/player/machine.js`
- Test: `test/machine.test.js`

**Interfaces:**
- Consumes: nothing (it takes a week object shaped as in spec §4).
- Produces:
  - `TITLE`, `CLUES`, `RESOLVED`, `END` — phase constants (strings).
  - `CLUES_PER_ROUND` — `5`.
  - `pointValue(k: number) -> number`
  - `initialState(week) -> State`
  - `reduce(state: State, action: {type: string}) -> State`
  - `State` is `{ phase, round, k, outcome, outcomes, justResolved, week }` where `round` is a 0-based index, `k` is 1…5, `outcome` is `"win" | "fail" | null`, and `outcomes` is an array of per-round outcomes indexed by round.
  - Action types: `ADVANCE`, `BACK`, `WIN`, `FAIL`, `NEXT_ROUND`, `RESTART`.

- [ ] **Step 1: Write the failing tests**

```js
// test/machine.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TITLE, CLUES, RESOLVED, END, CLUES_PER_ROUND,
  initialState, reduce, pointValue,
} from "../src/player/machine.js";

const WEEK = {
  rounds: [
    { answer: "Rebekah", clues: ["a", "b", "c", "d", "e"] },
    { answer: "Elijah", clues: ["f", "g", "h", "i", "j"] },
  ],
};

const run = (state, ...types) =>
  types.reduce((s, type) => reduce(s, { type }), state);

test("starts on the title screen", () => {
  const s = initialState(WEEK);
  assert.equal(s.phase, TITLE);
  assert.equal(s.round, 0);
  assert.equal(s.k, 1);
});

test("advancing from the title opens round 1 with clue 1 showing", () => {
  const s = run(initialState(WEEK), "ADVANCE");
  assert.equal(s.phase, CLUES);
  assert.equal(s.round, 0);
  assert.equal(s.k, 1);
});

test("point value counts down from five to one", () => {
  assert.equal(pointValue(1), 5);
  assert.equal(pointValue(5), 1);
});

test("advance stops dead at clue five", () => {
  let s = run(initialState(WEEK), "ADVANCE");
  for (let i = 0; i < 10; i++) s = reduce(s, { type: "ADVANCE" });
  assert.equal(s.k, CLUES_PER_ROUND);
  assert.equal(s.phase, CLUES);
});

test("Y resolves as a win from any clue", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN");
  assert.equal(s.phase, RESOLVED);
  assert.equal(s.outcome, "win");
  assert.equal(s.justResolved, true);
});

test("N is ignored before clue five and accepted on it", () => {
  let s = run(initialState(WEEK), "ADVANCE", "FAIL");
  assert.equal(s.phase, CLUES, "N was accepted too early");

  s = run(s, "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE", "FAIL");
  assert.equal(s.phase, RESOLVED);
  assert.equal(s.outcome, "fail");
  assert.equal(s.justResolved, true);
});

test("the outcome of each round is recorded", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN", "NEXT_ROUND",
                "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE", "FAIL");
  assert.deepEqual(s.outcomes, ["win", "fail"]);
});

test("next round resets to clue one and clears the outcome", () => {
  const s = run(initialState(WEEK), "ADVANCE", "ADVANCE", "WIN", "NEXT_ROUND");
  assert.equal(s.phase, CLUES);
  assert.equal(s.round, 1);
  assert.equal(s.k, 1);
  assert.equal(s.outcome, null);
});

test("the last round leads to END", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN", "NEXT_ROUND", "WIN", "NEXT_ROUND");
  assert.equal(s.phase, END);
});

test("justResolved is true only on the resolving transition", () => {
  const won = run(initialState(WEEK), "ADVANCE", "WIN");
  assert.equal(won.justResolved, true);
  assert.equal(reduce(won, { type: "NOOP" }).justResolved, false);
});

test("restart returns to the title screen", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN", "NEXT_ROUND", "WIN", "NEXT_ROUND", "RESTART");
  assert.equal(s.phase, TITLE);
  assert.deepEqual(s.outcomes, []);
});

test("the reducer never mutates the state it is given", () => {
  const before = initialState(WEEK);
  const snapshot = JSON.stringify(before);
  reduce(before, { type: "ADVANCE" });
  assert.equal(JSON.stringify(before), snapshot);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/machine.test.js`
Expected: FAIL — no export named `initialState`.

- [ ] **Step 3: Implement the forward transitions**

`BACK` is deliberately left as a no-op here; Task 4 implements it.

```js
// src/player/machine.js
// The whole game, as a pure reducer. No DOM, no timers.

export const TITLE = "TITLE";
export const CLUES = "CLUES";
export const RESOLVED = "RESOLVED";
export const END = "END";

export const CLUES_PER_ROUND = 5;

export function pointValue(k) {
  return CLUES_PER_ROUND + 1 - k;
}

export function initialState(week) {
  return {
    phase: TITLE,
    round: 0,
    k: 1,
    outcome: null,
    outcomes: [],
    justResolved: false,
    week,
  };
}

function recordOutcome(outcomes, round, outcome) {
  const next = outcomes.slice();
  next[round] = outcome;
  return next;
}

export function reduce(state, action) {
  const lastRound = state.week.rounds.length - 1;
  // Every path starts from justResolved: false, so only WIN and FAIL can set it.
  const s = { ...state, justResolved: false };

  switch (action.type) {
    case "ADVANCE":
      if (s.phase === TITLE) return { ...s, phase: CLUES, round: 0, k: 1 };
      // The end screen invites "press space to start over", so honour it.
      if (s.phase === END) return initialState(s.week);
      if (s.phase !== CLUES) return s;
      return s.k >= CLUES_PER_ROUND ? s : { ...s, k: s.k + 1 };

    case "WIN":
      if (s.phase !== CLUES) return s;
      return {
        ...s,
        phase: RESOLVED,
        outcome: "win",
        outcomes: recordOutcome(s.outcomes, s.round, "win"),
        justResolved: true,
      };

    case "FAIL":
      // Only meaningful once every clue has been shown.
      if (s.phase !== CLUES || s.k < CLUES_PER_ROUND) return s;
      return {
        ...s,
        phase: RESOLVED,
        outcome: "fail",
        outcomes: recordOutcome(s.outcomes, s.round, "fail"),
        justResolved: true,
      };

    case "NEXT_ROUND":
      if (s.phase !== RESOLVED) return s;
      if (s.round >= lastRound) return { ...s, phase: END };
      return { ...s, phase: CLUES, round: s.round + 1, k: 1, outcome: null };

    case "RESTART":
      return initialState(s.week);

    default:
      return s;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/machine.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/machine.js test/machine.test.js
git commit -m "Add game state machine forward transitions"
```

---

### Task 4: State machine — going back

Implements the go-back table in spec §5.2. Every row gets a test, including the two that cross a round boundary. The rule that matters most: re-entering `RESOLVED` must never set `justResolved`, so the effect does not replay.

**Files:**
- Modify: `src/player/machine.js`
- Modify: `test/machine.test.js` (append)

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: the `BACK` action becomes functional. No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `test/machine.test.js`:

```js
test("back steps to the previous clue", () => {
  const s = run(initialState(WEEK), "ADVANCE", "ADVANCE", "ADVANCE", "BACK");
  assert.equal(s.phase, CLUES);
  assert.equal(s.k, 2);
});

test("back from clue one of round one returns to the title", () => {
  const s = run(initialState(WEEK), "ADVANCE", "BACK");
  assert.equal(s.phase, TITLE);
});

test("back from the title does nothing", () => {
  const s = run(initialState(WEEK), "BACK");
  assert.equal(s.phase, TITLE);
});

test("back from RESOLVED returns to clue five without replaying the effect", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN", "BACK");
  assert.equal(s.phase, CLUES);
  assert.equal(s.k, CLUES_PER_ROUND);
  assert.equal(s.justResolved, false);
  assert.equal(s.outcome, null);
});

test("back from clue one of a later round lands on the previous answer", () => {
  const s = run(initialState(WEEK), "ADVANCE", "WIN", "NEXT_ROUND", "BACK");
  assert.equal(s.phase, RESOLVED);
  assert.equal(s.round, 0);
  assert.equal(s.k, CLUES_PER_ROUND);
  assert.equal(s.outcome, "win", "the earlier round's own outcome must be restored");
  assert.equal(s.justResolved, false, "the effect must not replay");
});

test("crossing back over a failed round restores 'fail', not 'win'", () => {
  const s = run(initialState(WEEK),
    "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE", "FAIL",
    "NEXT_ROUND", "BACK");
  assert.equal(s.outcome, "fail");
});

test("back from END returns to the final answer without replaying the effect", () => {
  const s = run(initialState(WEEK),
    "ADVANCE", "WIN", "NEXT_ROUND", "WIN", "NEXT_ROUND", "BACK");
  assert.equal(s.phase, RESOLVED);
  assert.equal(s.round, 1);
  assert.equal(s.outcome, "win");
  assert.equal(s.justResolved, false);
});

test("back then forward returns to where you were", () => {
  const there = run(initialState(WEEK), "ADVANCE", "ADVANCE", "ADVANCE");
  const andBack = run(there, "BACK", "ADVANCE");
  assert.equal(andBack.phase, there.phase);
  assert.equal(andBack.round, there.round);
  assert.equal(andBack.k, there.k);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/machine.test.js`
Expected: the eight new tests FAIL (`BACK` currently falls through to `default` and returns the state unchanged); the twelve from Task 3 still PASS.

- [ ] **Step 3: Implement `BACK`**

Insert this case into the `switch` in `src/player/machine.js`, immediately before `case "RESTART":`

```js
    case "BACK": {
      // There is nowhere earlier than the title screen.
      if (s.phase === TITLE) return s;

      // From the end screen, back into the final round's answer.
      if (s.phase === END) {
        return {
          ...s,
          phase: RESOLVED,
          round: lastRound,
          k: CLUES_PER_ROUND,
          outcome: s.outcomes[lastRound] ?? "fail",
        };
      }

      // From an answer, back to the last clue of the same round. The outcome is
      // cleared so the round can be resolved differently on the way forward.
      if (s.phase === RESOLVED) {
        return { ...s, phase: CLUES, k: CLUES_PER_ROUND, outcome: null };
      }

      // Within a round, step one clue back.
      if (s.k > 1) return { ...s, k: s.k - 1 };

      // At clue one, cross the boundary into the previous round's answer,
      // restoring the outcome that round actually had.
      if (s.round > 0) {
        const previous = s.round - 1;
        return {
          ...s,
          phase: RESOLVED,
          round: previous,
          k: CLUES_PER_ROUND,
          outcome: s.outcomes[previous] ?? "fail",
        };
      }

      return { ...s, phase: TITLE };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/machine.test.js`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/machine.js test/machine.test.js
git commit -m "Allow going back from every state without replaying effects"
```

---
### Task 5: Week storage

Keeps a library of up to ten weeks in `localStorage` so the moderator can re-run an earlier week, and degrades to the embedded week whenever storage is missing, corrupt, or throws. iOS *does* throw on storage access in some configurations, so the throwing case is a real requirement, not defensive padding.

`createStorage` takes its backing store as an argument. That is what makes it testable in Node without a DOM.

**Files:**
- Modify: `src/player/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createStorage(backing) -> { loadWeeks(), saveWeek(week), deleteWeek(id), setActiveWeekId(id), getActiveWeek(embeddedWeek) }`. `backing` is anything with `getItem`/`setItem`/`removeItem`. Also exports `MAX_WEEKS` (`10`), `WEEKS_KEY`, `ACTIVE_KEY`.

- [ ] **Step 1: Write the failing tests**

```js
// test/storage.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage, MAX_WEEKS } from "../src/player/storage.js";

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

class ThrowingStorage {
  getItem() { throw new DOMExceptionish(); }
  setItem() { throw new DOMExceptionish(); }
  removeItem() { throw new DOMExceptionish(); }
}
class DOMExceptionish extends Error {}

const week = (id, answer = "Rebekah") => ({
  formatVersion: 1, id, title: id,
  theme: { background: "slate", backgroundImage: null, winEffect: "fireworks", loseEffect: "ashfall" },
  rounds: [{ answer, clues: ["a", "b", "c", "d", "e"] }],
});

const EMBEDDED = week("embedded", "Elijah");

test("with nothing stored, the embedded week is used", () => {
  const s = createStorage(new FakeStorage());
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("a saved week becomes the active one", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("2026-09-20"));
  assert.equal(s.getActiveWeek(EMBEDDED).id, "2026-09-20");
  assert.equal(s.loadWeeks().length, 1);
});

test("saving the same id replaces rather than duplicates", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("2026-09-20", "Old"));
  s.saveWeek(week("2026-09-20", "New"));
  const weeks = s.loadWeeks();
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].rounds[0].answer, "New");
});

test("the library is capped, dropping the oldest", () => {
  const s = createStorage(new FakeStorage());
  for (let i = 0; i < MAX_WEEKS + 3; i++) s.saveWeek(week(`w${i}`));
  const ids = s.loadWeeks().map(w => w.id);
  assert.equal(ids.length, MAX_WEEKS);
  assert.equal(ids[0], "w3", "the three oldest should have been dropped");
  assert.equal(ids.at(-1), `w${MAX_WEEKS + 2}`);
});

test("an explicit active id is honoured", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.saveWeek(week("b"));
  s.setActiveWeekId("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "a");
});

test("an active id pointing at a deleted week falls back to the newest", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.saveWeek(week("b"));
  s.setActiveWeekId("a");
  s.deleteWeek("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "b");
});

test("deleting the only week falls back to the embedded one", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.deleteWeek("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("corrupt stored data is ignored rather than thrown", () => {
  const backing = new FakeStorage();
  backing.setItem("bibleClueGame.weeks", "{not json");
  const s = createStorage(backing);
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("stored data of the wrong shape is ignored", () => {
  const backing = new FakeStorage();
  backing.setItem("bibleClueGame.weeks", JSON.stringify([{ id: "x" }, 42, null]));
  const s = createStorage(backing);
  assert.deepEqual(s.loadWeeks(), [], "entries without rounds are not weeks");
});

test("a storage backend that throws never breaks the game", () => {
  const s = createStorage(new ThrowingStorage());
  assert.deepEqual(s.loadWeeks(), []);
  assert.doesNotThrow(() => s.saveWeek(week("a")));
  assert.doesNotThrow(() => s.setActiveWeekId("a"));
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("a missing backing store is tolerated", () => {
  const s = createStorage(null);
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/storage.test.js`
Expected: FAIL — no export named `createStorage`.

- [ ] **Step 3: Implement storage**

```js
// src/player/storage.js
// A small library of weeks in localStorage. Every path degrades to the
// embedded week rather than throwing: iOS can refuse storage access outright.

export const WEEKS_KEY = "bibleClueGame.weeks";
export const ACTIVE_KEY = "bibleClueGame.activeWeekId";
export const MAX_WEEKS = 10;

function isWeek(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && Array.isArray(value.rounds)
    && value.rounds.length > 0;
}

export function createStorage(backing) {
  function read(key) {
    try {
      return backing ? backing.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (backing) backing.setItem(key, value);
    } catch {
      // Storage unavailable. The in-memory session still works.
    }
  }

  function loadWeeks() {
    const raw = read(WEEKS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isWeek) : [];
    } catch {
      return [];
    }
  }

  function persist(weeks) {
    write(WEEKS_KEY, JSON.stringify(weeks));
    return weeks;
  }

  function saveWeek(newWeek) {
    if (!isWeek(newWeek)) return loadWeeks();
    const weeks = loadWeeks().filter(w => w.id !== newWeek.id);
    weeks.push(newWeek);
    // Oldest first, so trimming from the front drops the oldest.
    const trimmed = weeks.slice(-MAX_WEEKS);
    persist(trimmed);
    setActiveWeekId(newWeek.id);
    return trimmed;
  }

  function deleteWeek(id) {
    const remaining = loadWeeks().filter(w => w.id !== id);
    persist(remaining);
    if (read(ACTIVE_KEY) === id) {
      const newest = remaining.at(-1);
      if (newest) setActiveWeekId(newest.id);
      else try { backing?.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    }
    return remaining;
  }

  function setActiveWeekId(id) {
    write(ACTIVE_KEY, id);
  }

  function getActiveWeek(embeddedWeek) {
    const weeks = loadWeeks();
    if (weeks.length === 0) return embeddedWeek;
    const activeId = read(ACTIVE_KEY);
    return weeks.find(w => w.id === activeId) ?? weeks.at(-1) ?? embeddedWeek;
  }

  return { loadWeeks, saveWeek, deleteWeek, setActiveWeekId, getActiveWeek };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/storage.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/storage.js test/storage.test.js
git commit -m "Store a capped library of weeks with safe fallbacks"
```

---

### Task 6: View model, stylesheet, and renderer

Rendering is split in two so the interesting half stays testable without a DOM: `viewModel(state)` is a pure function producing every string and flag the screen needs, and `createRenderer` does nothing but push that object into a fixed DOM skeleton. Only the pure half is unit tested; the DOM half is deliberately too dumb to hold a bug.

**Files:**
- Modify: `src/player/render.js`
- Modify: `src/player/style.css`
- Modify: `src/player/index.html` (add the `#stage` skeleton — replace the empty `<div id="stage">`)
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `TITLE`/`CLUES`/`RESOLVED`/`END`, `CLUES_PER_ROUND`, `pointValue` from `machine.js`.
- Produces:
  - `viewModel(state) -> { phase, roundLabel, pointsLabel, clues: Array<{n, text, visible}>, answer, outcome, showControls, failEnabled, showAnswer, showNext, showTitle, showEnd }`
  - `createRenderer(root) -> { render(vm) }`
  - `BACKGROUNDS` — array of the eight preset ids, in palette order.

- [ ] **Step 1: Write the failing tests**

```js
// test/render.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { viewModel, BACKGROUNDS } from "../src/player/render.js";
import { initialState, reduce, CLUES_PER_ROUND } from "../src/player/machine.js";

const WEEK = {
  rounds: [
    { answer: "Rebekah", clues: ["An answer to prayer", "Animal lover", "Stay hydrated", "Born when their spouse almost died", "Eavesdropper"] },
    { answer: "Elijah", clues: ["f", "g", "h", "i", "j"] },
  ],
};
const run = (state, ...types) => types.reduce((s, type) => reduce(s, { type }), state);

test("there are exactly eight backgrounds", () => {
  assert.equal(BACKGROUNDS.length, 8);
  assert.equal(new Set(BACKGROUNDS).size, 8, "background ids must be unique");
});

test("the title screen shows only itself", () => {
  const vm = viewModel(initialState(WEEK));
  assert.equal(vm.showTitle, true);
  assert.equal(vm.showControls, false);
  assert.equal(vm.showAnswer, false);
});

test("all five clue slots always exist, so nothing shifts position", () => {
  const vm = viewModel(run(initialState(WEEK), "ADVANCE"));
  assert.equal(vm.clues.length, CLUES_PER_ROUND);
  assert.deepEqual(vm.clues.map(c => c.visible), [true, false, false, false, false]);
  assert.equal(vm.clues[0].text, "An answer to prayer");
  assert.equal(vm.clues[4].text, "Eavesdropper", "hidden slots still carry their text");
});

test("the round and point labels read correctly", () => {
  const vm = viewModel(run(initialState(WEEK), "ADVANCE", "ADVANCE"));
  assert.equal(vm.roundLabel, "Round 1 of 2");
  assert.equal(vm.pointsLabel, "Worth 4 points");
});

test("one point is singular", () => {
  const vm = viewModel(run(initialState(WEEK), "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE"));
  assert.equal(vm.pointsLabel, "Worth 1 point");
});

test("the fail button is disabled until the last clue", () => {
  let s = run(initialState(WEEK), "ADVANCE");
  assert.equal(viewModel(s).failEnabled, false);
  s = run(s, "ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE");
  assert.equal(viewModel(s).failEnabled, true);
});

test("resolving reveals the answer and the next affordance", () => {
  const vm = viewModel(run(initialState(WEEK), "ADVANCE", "WIN"));
  assert.equal(vm.showAnswer, true);
  assert.equal(vm.answer, "Rebekah");
  assert.equal(vm.outcome, "win");
  assert.equal(vm.showNext, true);
  assert.equal(vm.showControls, false, "the check and X are gone once resolved");
});

test("the end screen replaces everything", () => {
  const vm = viewModel(run(initialState(WEEK), "ADVANCE", "WIN", "NEXT_ROUND", "WIN", "NEXT_ROUND"));
  assert.equal(vm.showEnd, true);
  assert.equal(vm.showAnswer, false);
  assert.equal(vm.showControls, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/render.test.js`
Expected: FAIL — no export named `viewModel`.

- [ ] **Step 3: Implement the view model and renderer**

```js
// src/player/render.js
// A pure view model plus a renderer too dumb to hold a bug.

import { TITLE, CLUES, RESOLVED, END, CLUES_PER_ROUND, pointValue } from "./machine.js";

export const BACKGROUNDS = [
  "slate", "ink", "parchment", "teal", "plum", "forest", "charcoal", "sand",
];

export function viewModel(state) {
  const { phase, round, k, week } = state;
  const current = week.rounds[round] ?? { answer: "", clues: [] };
  const points = pointValue(k);

  const clues = [];
  for (let i = 0; i < CLUES_PER_ROUND; i++) {
    clues.push({
      n: i + 1,
      text: current.clues[i] ?? "",
      // Every slot is rendered; visibility alone changes. Reserving all five
      // is what keeps the list in the same place as clues appear.
      visible: phase !== TITLE && phase !== END && i < k,
    });
  }

  return {
    phase,
    roundLabel: `Round ${round + 1} of ${week.rounds.length}`,
    pointsLabel: `Worth ${points} ${points === 1 ? "point" : "points"}`,
    clues,
    answer: current.answer,
    outcome: state.outcome,
    showTitle: phase === TITLE,
    showEnd: phase === END,
    showControls: phase === CLUES,
    failEnabled: phase === CLUES && k >= CLUES_PER_ROUND,
    showAnswer: phase === RESOLVED,
    showNext: phase === RESOLVED,
  };
}

export function createRenderer(root) {
  const $ = sel => root.querySelector(sel);
  const clueNodes = Array.from(root.querySelectorAll(".clue"));
  const roundLabel = $(".hud-round");
  const pointsLabel = $(".hud-points");
  const answerPanel = $(".answer");
  const answerText = $(".answer-text");
  const controls = $(".controls");
  const failButton = $(".btn-fail");
  const nextBar = $(".next-bar");
  const titleScreen = $(".screen-title");
  const endScreen = $(".screen-end");

  function render(vm) {
    roundLabel.textContent = vm.roundLabel;
    pointsLabel.textContent = vm.pointsLabel;

    clueNodes.forEach((node, i) => {
      const clue = vm.clues[i];
      node.querySelector(".clue-text").textContent = clue.text;
      node.classList.toggle("is-visible", clue.visible);
    });

    answerText.textContent = vm.answer;
    answerPanel.dataset.outcome = vm.outcome ?? "";

    titleScreen.hidden = !vm.showTitle;
    endScreen.hidden = !vm.showEnd;
    answerPanel.hidden = !vm.showAnswer;
    nextBar.hidden = !vm.showNext;
    controls.hidden = !vm.showControls;
    failButton.disabled = !vm.failEnabled;

    root.dataset.phase = vm.phase;
  }

  return { render };
}
```

- [ ] **Step 4: Replace the `#stage` element in `src/player/index.html`**

```html
<div id="stage" class="stage" data-bg="slate" aria-live="polite">
  <header class="hud">
    <span class="hud-round"></span>
    <span class="hud-points"></span>
  </header>

  <ol class="clues">
    <li class="clue"><span class="clue-num">1</span><span class="clue-text"></span></li>
    <li class="clue"><span class="clue-num">2</span><span class="clue-text"></span></li>
    <li class="clue"><span class="clue-num">3</span><span class="clue-text"></span></li>
    <li class="clue"><span class="clue-num">4</span><span class="clue-text"></span></li>
    <li class="clue"><span class="clue-num">5</span><span class="clue-text"></span></li>
  </ol>

  <div class="answer" hidden><span class="answer-text"></span></div>

  <footer class="controls" hidden>
    <button class="btn btn-win" type="button" aria-label="Someone guessed correctly">&check;</button>
    <button class="btn btn-fail" type="button" aria-label="Nobody guessed it">&times;</button>
  </footer>

  <div class="next-bar" role="button" tabindex="0" hidden>Next round &darr;</div>

  <section class="screen screen-title" hidden>
    <h1>Who Am I?</h1>
    <p class="lede">Five clues about a Bible character are revealed one at a time.
      Once you think you know, call out your name and lock in your answer.
      The earlier you call it, the more it is worth.</p>
    <table class="scoring">
      <tr><td>By clue 1</td><td>5 points</td></tr>
      <tr><td>By clue 2</td><td>4 points</td></tr>
      <tr><td>By clue 3</td><td>3 points</td></tr>
      <tr><td>By clue 4</td><td>2 points</td></tr>
      <tr><td>By clue 5</td><td>1 point</td></tr>
    </table>
    <p class="hint">Press space to begin</p>
  </section>

  <section class="screen screen-end" hidden>
    <h1>That's all for today</h1>
    <p class="hint">Press space to start over</p>
  </section>
</div>
```

- [ ] **Step 5: Write `src/player/style.css`**

Flat fills only — no gradients anywhere (spec §2). Weight over size. All five clue slots occupy space whether visible or not.

```css
:root {
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --pad: clamp(16px, 3vh, 40px);
}

/* Eight flat palettes. Each sets a ground, a foreground, a muted tone and an accent. */
.stage[data-bg="slate"]     { --bg:#2b3444; --fg:#f2f5fa; --muted:#8f9bb3; --accent:#6fd0ff; }
.stage[data-bg="ink"]       { --bg:#141821; --fg:#eef1f7; --muted:#7b8499; --accent:#ffc44d; }
.stage[data-bg="parchment"] { --bg:#efe6d2; --fg:#2a2419; --muted:#7d7259; --accent:#a8501e; }
.stage[data-bg="teal"]      { --bg:#0f3d3e; --fg:#eafaf7; --muted:#7fada9; --accent:#ffd166; }
.stage[data-bg="plum"]      { --bg:#3a2440; --fg:#f8eefb; --muted:#a68bad; --accent:#ffb3c7; }
.stage[data-bg="forest"]    { --bg:#1e3524; --fg:#eef6ec; --muted:#8ba98d; --accent:#ffd97d; }
.stage[data-bg="charcoal"]  { --bg:#232323; --fg:#f4f4f4; --muted:#8d8d8d; --accent:#7fd4a0; }
.stage[data-bg="sand"]      { --bg:#d9c9a8; --fg:#2c2617; --muted:#7a6f55; --accent:#8f3d1f; }

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

html, body {
  height: 100%; margin: 0;
  background: #000;
  font-family: var(--font);
  overflow: hidden;
  touch-action: manipulation;
  -webkit-user-select: none; user-select: none;
}

/* 16:9 stage, centred and letterboxed on any other aspect ratio. */
.stage {
  position: absolute; inset: 0; margin: auto;
  aspect-ratio: 16 / 9;
  max-width: 100%; max-height: 100%;
  background: var(--bg);
  background-size: cover; background-position: center;
  color: var(--fg);
  display: flex; flex-direction: column;
  padding: var(--pad);
  overflow: hidden;
}

/* A scrim keeps clue text legible when a photo background is set. */
.stage[style*="background-image"]::before {
  content: ""; position: absolute; inset: 0;
  background: rgba(0, 0, 0, 0.55);
}
.stage > * { position: relative; z-index: 1; }

.hud {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: clamp(13px, 2.2vh, 22px); font-weight: 700;
  color: var(--muted); letter-spacing: 0.02em;
  flex: 0 0 auto;
}
.hud-points { color: var(--accent); }

.clues {
  list-style: none; margin: 0; padding: 0;
  flex: 1 1 auto;
  display: flex; flex-direction: column; justify-content: center;
  gap: clamp(6px, 1.6vh, 20px);
  max-width: 46ch; width: 100%; margin-inline: auto;
}

/* Every slot occupies its space from the start of the round; only opacity
   changes. This is what keeps the list in the same place as clues appear. */
.clue {
  display: flex; gap: clamp(10px, 2vw, 24px); align-items: baseline;
  font-size: clamp(22px, 4.2vh, 44px); font-weight: 600; line-height: 1.25;
  opacity: 0; transform: translateY(12px);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.clue.is-visible { opacity: 1; transform: none; }
.clue-num {
  flex: 0 0 auto; min-width: 1.4em;
  color: var(--muted); font-weight: 800; font-variant-numeric: tabular-nums;
}

.answer {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bg) 82%, black);
  padding: var(--pad); text-align: center;
  z-index: 3;
}
.answer-text {
  font-size: clamp(40px, 10vh, 110px); font-weight: 800; letter-spacing: -0.02em;
}
.answer[data-outcome="win"]  .answer-text { color: var(--accent); }
.answer[data-outcome="fail"] .answer-text { color: var(--muted); }

.controls {
  flex: 0 0 auto;
  display: flex; justify-content: space-between; align-items: flex-end;
}
.btn {
  font: inherit; font-size: clamp(26px, 5vh, 52px); line-height: 1;
  width: clamp(64px, 11vh, 116px); aspect-ratio: 1;
  border-radius: 50%; border: 3px solid currentColor;
  background: transparent; cursor: pointer;
}
.btn-win  { color: #3ddc8a; }
.btn-fail { color: #ff5c7a; }
.btn:disabled { opacity: 0.22; cursor: default; }

.next-bar {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 4;
  padding: clamp(12px, 2.4vh, 26px);
  text-align: center; font-size: clamp(15px, 2.6vh, 26px); font-weight: 700;
  color: var(--bg); background: var(--accent); cursor: pointer;
}

.screen {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(10px, 2vh, 22px);
  background: var(--bg); padding: var(--pad); text-align: center;
}
.screen h1 { margin: 0; font-size: clamp(30px, 7vh, 74px); font-weight: 800; }
.lede { margin: 0; max-width: 42ch; font-size: clamp(15px, 2.6vh, 26px); font-weight: 600; color: var(--fg); }
.scoring { border-collapse: collapse; font-size: clamp(14px, 2.4vh, 24px); font-weight: 700; }
.scoring td { padding: 0.18em 0.9em; }
.scoring td:first-child { text-align: right; color: var(--muted); }
.scoring td:last-child { text-align: left; color: var(--accent); }
.hint { margin: 0; color: var(--muted); font-size: clamp(13px, 2.2vh, 22px); font-weight: 700; }

#fx { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 6; }

@media (prefers-reduced-motion: reduce) {
  .clue { transition-duration: 1ms; transform: none; }
}
```

- [ ] **Step 6: Run every test**

Run: `node --test`
Expected: PASS — Task 1's build test plus parser, machine, storage and render suites.

- [ ] **Step 7: Look at it**

Run `python3 build.py`, open `dist/index.html` in a desktop browser, and confirm by eye: the stage is 16:9 and letterboxed, the title screen is centred and readable, and nothing overflows. The screen will be static — nothing is wired up until Task 10.

- [ ] **Step 8: Commit**

```bash
git add src/player/render.js src/player/style.css src/player/index.html test/render.test.js dist/index.html
git commit -m "Add view model, stage layout and eight flat palettes"
```

---
### Task 7: Effect engine core

The engine is deliberately split from the presets. It owns the canvas, the device-pixel-ratio handling, the animation loop, and the particle physics; it knows nothing about what fireworks look like. `stepParticle` is a pure function so the physics can be tested without a canvas.

**Files:**
- Modify: `src/player/effects.js`
- Test: `test/effects.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIN_RADIUS` (`6`), `MAX_RADIUS` (`14`), `MAX_PARTICLES` (`250`), `MIN_DURATION` (`2500`), `MAX_DURATION` (`7000`).
  - `makeParticle(overrides) -> Particle`, filling every field with a default.
  - `stepParticle(p, f) -> Particle` — advances one particle by `f` frames (1 = one frame at 60 fps). Mutates and returns.
  - `createEngine(canvas, stage) -> { play(preset), stop(), resize() }` where `preset` is a Task 8 preset object.
  - `Particle` is `{ x, y, vx, vy, r, color, shape, life, decay, gravity, drag, spin, rotation, delay }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/effects.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeParticle, stepParticle,
  MIN_RADIUS, MAX_RADIUS, MAX_PARTICLES, MIN_DURATION, MAX_DURATION,
} from "../src/player/effects.js";

test("the compression budget is what the spec says", () => {
  assert.equal(MIN_RADIUS, 6);
  assert.equal(MAX_RADIUS, 14);
  assert.equal(MAX_PARTICLES, 250);
  assert.equal(MIN_DURATION, 2500);
  assert.equal(MAX_DURATION, 7000);
});

test("a particle gets sane defaults", () => {
  const p = makeParticle({ x: 10, y: 20 });
  assert.equal(p.x, 10);
  assert.equal(p.life, 1);
  assert.equal(p.shape, "circle");
  assert.equal(p.delay, 0);
});

test("gravity pulls a particle down over time", () => {
  const p = makeParticle({ y: 0, vy: 0, gravity: 0.3, drag: 1 });
  stepParticle(p, 1);
  assert.equal(p.vy, 0.3);
  assert.equal(p.y, 0.3);
});

test("drag slows horizontal motion", () => {
  const p = makeParticle({ vx: 10, drag: 0.5, gravity: 0 });
  stepParticle(p, 1);
  assert.equal(p.vx, 5);
});

test("life decays and can be driven to zero", () => {
  const p = makeParticle({ decay: 0.25 });
  for (let i = 0; i < 4; i++) stepParticle(p, 1);
  assert.ok(p.life <= 0, "particle should be spent");
});

test("the frame count scales displacement linearly", () => {
  const a = makeParticle({ x: 0, vx: 3, gravity: 0, drag: 1 });
  const b = makeParticle({ x: 0, vx: 3, gravity: 0, drag: 1 });
  stepParticle(a, 2);
  stepParticle(b, 1);
  assert.equal(a.x, 6);
  assert.equal(b.x, 3);
});

test("a long frame gap applies proportionally more gravity", () => {
  // This is Euler integration, so two half-steps do NOT equal one whole step.
  // What must hold is that a single step scales with the frame count.
  const p = makeParticle({ vy: 0, gravity: 0.5, drag: 1 });
  stepParticle(p, 3);
  assert.equal(p.vy, 1.5);
});

test("a delayed particle holds still and burns off its delay", () => {
  const p = makeParticle({ x: 0, vx: 5, delay: 2, gravity: 0, drag: 1 });
  stepParticle(p, 1);
  assert.equal(p.x, 0, "should not move while delayed");
  assert.equal(p.delay, 1);
  stepParticle(p, 1);
  assert.equal(p.x, 0);
  stepParticle(p, 1);
  assert.equal(p.x, 5, "should move once the delay is spent");
});

test("spin accumulates into rotation", () => {
  const p = makeParticle({ spin: 0.2, rotation: 0 });
  stepParticle(p, 3);
  assert.ok(Math.abs(p.rotation - 0.6) < 1e-9);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/effects.test.js`
Expected: FAIL — no export named `makeParticle`.

- [ ] **Step 3: Implement the engine**

```js
// src/player/effects.js
// Canvas particle engine. Knows how a particle moves; knows nothing about
// what fireworks look like. Presets supply that.

// The compression budget from spec §2. Fine, fast particles turn to grey mush
// through Google Meet's encoder, so these bounds are load-bearing, not taste.
export const MIN_RADIUS = 6;
export const MAX_RADIUS = 14;
export const MAX_PARTICLES = 250;
export const MIN_DURATION = 2500;
export const MAX_DURATION = 7000;

export function makeParticle(overrides = {}) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    r: MIN_RADIUS,
    color: "#ffffff",
    shape: "circle",
    life: 1,
    decay: 0.01,
    gravity: 0.25,
    drag: 0.99,
    spin: 0,
    rotation: 0,
    delay: 0,
    ...overrides,
  };
}

export function stepParticle(p, f = 1) {
  if (p.delay > 0) {
    p.delay = Math.max(0, p.delay - f);
    return p;
  }
  p.vy += p.gravity * f;
  const damp = Math.pow(p.drag, f);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * f;
  p.y += p.vy * f;
  p.rotation += p.spin * f;
  p.life -= p.decay * f;
  return p;
}

function drawParticle(ctx, p) {
  if (p.delay > 0) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;

  switch (p.shape) {
    case "ribbon": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.r * 0.4, -p.r * 1.3, p.r * 0.8, p.r * 2.6);
      ctx.restore();
      break;
    }
    case "disc": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      // Squashing on one axis reads as a tumbling coin.
      ctx.ellipse(0, 0, p.r, p.r * Math.abs(Math.cos(p.rotation)) * 0.9 + p.r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "shard": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.lineTo(p.r * 0.85, p.r * 0.7);
      ctx.lineTo(-p.r * 0.7, p.r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "streak": {
      ctx.lineWidth = p.r * 0.55;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createEngine(canvas, stage) {
  const ctx = canvas.getContext("2d");
  const reduced = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let particles = [];
  let raf = null;
  let lastTime = 0;
  let overlayClass = null;
  let overlayTimer = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearOverlay() {
    if (overlayClass) stage.classList.remove(overlayClass);
    overlayClass = null;
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }

  function frame(now) {
    const f = lastTime ? Math.min((now - lastTime) / (1000 / 60), 3) : 1;
    lastTime = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      stepParticle(p, f);
      if (p.life <= 0 || p.y - p.r > window.innerHeight + 80) particles.splice(i, 1);
      else drawParticle(ctx, p);
    }
    ctx.globalAlpha = 1;

    if (particles.length) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
      lastTime = 0;
    }
  }

  function play(preset) {
    stop();
    if (!preset) return;

    if (preset.overlay) {
      overlayClass = preset.overlay;
      stage.classList.add(overlayClass);
      overlayTimer = setTimeout(clearOverlay, preset.duration);
    }

    // Reduced motion gets the overlay's colour wash but no particle storm.
    if (reduced) return;

    resize();
    particles = preset
      .emit({ width: window.innerWidth, height: window.innerHeight })
      .slice(0, MAX_PARTICLES);

    if (particles.length && !raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastTime = 0;
    particles = [];
    clearOverlay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resize);
  resize();

  return { play, stop, resize };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/effects.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/effects.js test/effects.test.js
git commit -m "Add canvas particle engine with a compression budget"
```

---

### Task 8: The eleven effect presets

Six celebrations and five failures, each a data table entry rather than new code. The tests here are as much a guard on the *budget* as on the presets: any future preset that drifts outside the compression bounds fails the suite.

Two presets (`deflate`, `iris`) emit no particles at all and work entirely through a CSS overlay class. That is intentional — they are screen treatments, not particle storms.

**Files:**
- Modify: `src/player/effects.js` (append)
- Modify: `src/player/style.css` (append the overlay animations)
- Modify: `test/effects.test.js` (append)

**Interfaces:**
- Consumes: `makeParticle`, the budget constants.
- Produces:
  - `WIN_PRESETS`, `LOSE_PRESETS` — arrays of preset objects.
  - `PRESETS_BY_ID` — a lookup map.
  - `getPreset(id) -> preset | null`
  - A preset is `{ id, label, kind: "win"|"lose", duration, overlay: string|null, emit({width, height}) -> Particle[] }`.

- [ ] **Step 1: Write the failing tests**

```js
// append to test/effects.test.js
import {
  WIN_PRESETS, LOSE_PRESETS, PRESETS_BY_ID, getPreset,
} from "../src/player/effects.js";

const VIEWPORT = { width: 1280, height: 720 };
const ALL = () => [...WIN_PRESETS, ...LOSE_PRESETS];

test("there are six win presets and five lose presets", () => {
  assert.equal(WIN_PRESETS.length, 6);
  assert.equal(LOSE_PRESETS.length, 5);
  assert.deepEqual(
    WIN_PRESETS.map(p => p.id),
    ["fireworks", "cannons", "starburst", "goldenrain", "shockwave", "streamers"]);
  assert.deepEqual(
    LOSE_PRESETS.map(p => p.id),
    ["ashfall", "deflate", "shatter", "iris", "downpour"]);
});

test("every preset is uniquely identified and labelled", () => {
  const ids = ALL().map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of ALL()) {
    assert.equal(typeof p.label, "string");
    assert.ok(p.label.length > 0, `${p.id} has no label`);
    assert.equal(getPreset(p.id), p);
    assert.equal(PRESETS_BY_ID[p.id], p);
  }
});

test("an unknown id resolves to null", () => {
  assert.equal(getPreset("nope"), null);
  assert.equal(getPreset(undefined), null);
});

test("every preset declares the right kind", () => {
  for (const p of WIN_PRESETS) assert.equal(p.kind, "win", `${p.id}`);
  for (const p of LOSE_PRESETS) assert.equal(p.kind, "lose", `${p.id}`);
});

test("every duration is inside the spec's window", () => {
  for (const p of ALL()) {
    assert.ok(p.duration >= MIN_DURATION && p.duration <= MAX_DURATION,
      `${p.id} duration ${p.duration} is outside ${MIN_DURATION}-${MAX_DURATION}`);
  }
});

test("no preset exceeds the particle budget", () => {
  for (const p of ALL()) {
    const n = p.emit(VIEWPORT).length;
    assert.ok(n <= MAX_PARTICLES, `${p.id} emitted ${n}, over the ${MAX_PARTICLES} cap`);
  }
});

test("every emitted particle respects the radius bounds", () => {
  for (const p of ALL()) {
    for (const particle of p.emit(VIEWPORT)) {
      assert.ok(particle.r >= MIN_RADIUS && particle.r <= MAX_RADIUS,
        `${p.id} emitted r=${particle.r}, outside ${MIN_RADIUS}-${MAX_RADIUS}`);
    }
  }
});

test("every emitted particle starts alive, coloured and on-canvas horizontally", () => {
  for (const p of ALL()) {
    for (const particle of p.emit(VIEWPORT)) {
      assert.ok(particle.life > 0, `${p.id} emitted a dead particle`);
      assert.match(particle.color, /^#[0-9a-f]{6}$/i, `${p.id} has a bad colour`);
      assert.ok(particle.x >= -VIEWPORT.width && particle.x <= VIEWPORT.width * 2,
        `${p.id} emitted far off-canvas`);
    }
  }
});

test("the two screen-treatment presets use an overlay and no particles", () => {
  for (const id of ["deflate", "iris"]) {
    const p = getPreset(id);
    assert.equal(p.emit(VIEWPORT).length, 0, `${id} should emit nothing`);
    assert.equal(typeof p.overlay, "string", `${id} needs an overlay class`);
  }
});

test("particle presets declare no overlay", () => {
  for (const p of ALL()) {
    if (p.id === "deflate" || p.id === "iris") continue;
    assert.equal(p.overlay, null, `${p.id} should not set an overlay`);
    assert.ok(p.emit(VIEWPORT).length > 0, `${p.id} emitted nothing`);
  }
});

test("emission scales with the viewport rather than assuming a size", () => {
  const wide = getPreset("downpour").emit({ width: 2560, height: 1440 });
  assert.ok(wide.every(p => p.x <= 2560 * 1.2), "particles should stay near the viewport");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/effects.test.js`
Expected: the eleven new tests FAIL — no export named `WIN_PRESETS`.

- [ ] **Step 3: Implement the presets**

Append to `src/player/effects.js`:

```js
/* ---------- presets ---------- */

const GOLD = ["#ffd166", "#ffb703", "#ffe6a3", "#f7c948"];
const PARTY = ["#ff3b6b", "#ffc44d", "#33e08a", "#4db8ff", "#c99bff"];
const GREY = ["#9aa3b8", "#7b8499", "#b8bfd0", "#6f7891"];
const RAIN = ["#4a6ea8", "#3b5a8c", "#5c81bd"];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[(Math.random() * list.length) | 0];
const radius = () => rand(MIN_RADIUS, MAX_RADIUS);

// A radial burst of `count` particles from a point.
function burst(x, y, count, colors, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(opts.minSpeed ?? 3, opts.maxSpeed ?? 9);
    out.push(makeParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (opts.lift ?? 2),
      r: radius(),
      color: pick(colors),
      decay: opts.decay ?? 0.011,
      gravity: opts.gravity ?? 0.24,
      drag: opts.drag ?? 0.985,
      shape: opts.shape ?? "circle",
      spin: rand(-0.15, 0.15),
      delay: opts.delay ?? 0,
    }));
  }
  return out;
}

export const WIN_PRESETS = [
  {
    id: "fireworks",
    label: "Fireworks",
    kind: "win",
    duration: 3600,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Three bursts fired in sequence from the upper half.
      for (let i = 0; i < 3; i++) {
        out.push(...burst(
          rand(width * 0.2, width * 0.8),
          rand(height * 0.18, height * 0.45),
          58, PARTY,
          { delay: i * 26, decay: 0.012 }));
      }
      return out;
    },
  },
  {
    id: "cannons",
    label: "Confetti cannons",
    kind: "win",
    duration: 3200,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      for (const [x, dir] of [[0, 1], [width, -1]]) {
        for (let i = 0; i < 55; i++) {
          const speed = rand(9, 17);
          const angle = rand(-1.15, -0.55); // up and inward
          out.push(makeParticle({
            x, y: height,
            vx: Math.cos(angle) * speed * dir,
            vy: Math.sin(angle) * speed,
            r: radius(),
            color: pick(PARTY),
            shape: "ribbon",
            spin: rand(-0.3, 0.3),
            decay: 0.008,
            gravity: 0.26,
            drag: 0.988,
          }));
        }
      }
      return out;
    },
  },
  {
    id: "starburst",
    label: "Starburst",
    kind: "win",
    duration: 3000,
    overlay: null,
    emit({ width, height }) {
      // One large radial out of where the answer sits.
      return burst(width / 2, height * 0.5, 140, PARTY,
        { minSpeed: 5, maxSpeed: 15, gravity: 0.14, decay: 0.011, lift: 0 });
    },
  },
  {
    id: "goldenrain",
    label: "Golden rain",
    kind: "win",
    duration: 3800,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 90; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-260, -20),
          vx: rand(-0.5, 0.5),
          vy: rand(1.2, 2.8),
          r: radius(),
          color: pick(GOLD),
          shape: "disc",
          spin: rand(0.05, 0.2),
          decay: 0.005,
          gravity: 0.05,
          drag: 0.999,
          delay: Math.random() * 40,
        }));
      }
      return out;
    },
  },
  {
    id: "shockwave",
    label: "Shockwave",
    kind: "win",
    duration: 2800,
    overlay: null,
    emit({ width, height }) {
      const out = [];
      // Rings drawn as dense circles of particles moving outward together.
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 7 + ring * 1.4;
          out.push(makeParticle({
            x: width / 2, y: height * 0.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: rand(MIN_RADIUS, MIN_RADIUS + 3),
            color: pick(GOLD),
            decay: 0.014,
            gravity: 0,
            drag: 0.975,
            delay: ring * 14,
          }));
        }
      }
      return out;
    },
  },
  {
    id: "streamers",
    label: "Streamers",
    kind: "win",
    duration: 4000,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 70; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-300, -30),
          vx: rand(-1.2, 1.2),
          vy: rand(1.5, 3),
          r: rand(MAX_RADIUS - 4, MAX_RADIUS),
          color: pick(PARTY),
          shape: "ribbon",
          spin: rand(-0.22, 0.22),
          decay: 0.004,
          gravity: 0.035,
          drag: 0.999,
          delay: Math.random() * 50,
        }));
      }
      return out;
    },
  },
];

export const LOSE_PRESETS = [
  {
    id: "ashfall",
    label: "Ashfall",
    kind: "lose",
    duration: 3600,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 80; i++) {
        out.push(makeParticle({
          x: rand(0, width),
          y: rand(-240, -20),
          vx: rand(-0.6, 0.6),
          vy: rand(0.8, 1.8),
          r: rand(MIN_RADIUS, MIN_RADIUS + 4),
          color: pick(GREY),
          decay: 0.004,
          gravity: 0.012,
          drag: 0.999,
          delay: Math.random() * 45,
        }));
      }
      return out;
    },
  },
  {
    id: "deflate",
    label: "Deflate",
    kind: "lose",
    duration: 2600,
    overlay: "fx-deflate",
    emit() { return []; },
  },
  {
    id: "shatter",
    label: "Shatter",
    kind: "lose",
    duration: 3000,
    overlay: null,
    emit({ width, height }) {
      return burst(width / 2, height * 0.5, 90, GREY, {
        minSpeed: 3, maxSpeed: 10, gravity: 0.42, decay: 0.010,
        shape: "shard", lift: 1,
      });
    },
  },
  {
    id: "iris",
    label: "Iris",
    kind: "lose",
    duration: 2800,
    overlay: "fx-iris",
    emit() { return []; },
  },
  {
    id: "downpour",
    label: "Downpour",
    kind: "lose",
    duration: 3200,
    overlay: null,
    emit({ width }) {
      const out = [];
      for (let i = 0; i < 120; i++) {
        out.push(makeParticle({
          x: rand(-width * 0.1, width),
          y: rand(-300, -20),
          vx: 2.2,
          vy: rand(9, 14),
          r: rand(MIN_RADIUS, MIN_RADIUS + 2),
          color: pick(RAIN),
          shape: "streak",
          decay: 0.008,
          gravity: 0.12,
          drag: 1,
          delay: Math.random() * 30,
        }));
      }
      return out;
    },
  },
];

export const PRESETS_BY_ID = Object.fromEntries(
  [...WIN_PRESETS, ...LOSE_PRESETS].map(p => [p.id, p]));

export function getPreset(id) {
  return PRESETS_BY_ID[id] ?? null;
}
```

- [ ] **Step 4: Append the overlay animations to `src/player/style.css`**

```css
/* Screen-treatment effects. These are the two presets that emit no particles. */
@keyframes fx-shake {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-8px, 3px); }
  40% { transform: translate(7px, -4px); }
  60% { transform: translate(-5px, -2px); }
  80% { transform: translate(4px, 3px); }
}

.stage.fx-deflate {
  animation: fx-shake 520ms ease-in-out 1;
  filter: saturate(0.25);
  transition: filter 900ms ease-out;
}
.stage.fx-deflate::after {
  content: ""; position: absolute; inset: 0; z-index: 4; pointer-events: none;
  box-shadow: inset 0 0 clamp(60px, 14vh, 190px) clamp(20px, 5vh, 70px) rgba(150, 20, 45, 0.72);
}

.stage.fx-iris::after {
  content: ""; position: absolute; inset: 0; z-index: 4; pointer-events: none;
  background: #000;
  clip-path: circle(140% at 50% 50%);
  animation: fx-close 2600ms ease-in forwards;
}
@keyframes fx-close {
  to { clip-path: circle(26% at 50% 50%); }
}

@media (prefers-reduced-motion: reduce) {
  .stage.fx-deflate { animation: none; }
  .stage.fx-iris::after { animation: none; clip-path: circle(40% at 50% 50%); }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/effects.test.js`
Expected: PASS, 20 tests.

- [ ] **Step 6: Commit**

```bash
git add src/player/effects.js src/player/style.css test/effects.test.js
git commit -m "Add eleven effect presets within the compression budget"
```

---
### Task 9: Input — keys, taps, and debounce

The key map and the debounce gate are pure functions, so both are unit tested. The listener that calls them is thin.

The tests explicitly assert that `Enter`, `PageUp` and `PageDown` do **nothing**. Those keys were considered and deliberately rejected, and the tests exist so nobody helpfully adds them back.

**Files:**
- Modify: `src/player/input.js`
- Test: `test/input.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `keyToAction(key: string) -> string | null` — maps a `KeyboardEvent.key` to an action type.
  - `createDebouncer(ms) -> (now: number) => boolean` — returns `true` when the action should be allowed.
  - `DEBOUNCE_MS` — `250`.
  - `bindInput({ stage, dispatch, getState }) -> () => void` (returns an unbind function).

- [ ] **Step 1: Write the failing tests**

```js
// test/input.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyToAction, createDebouncer, DEBOUNCE_MS } from "../src/player/input.js";

test("space and right arrow advance", () => {
  assert.equal(keyToAction(" "), "ADVANCE");
  assert.equal(keyToAction("ArrowRight"), "ADVANCE");
});

test("left arrow and backspace go back", () => {
  assert.equal(keyToAction("ArrowLeft"), "BACK");
  assert.equal(keyToAction("Backspace"), "BACK");
});

test("y and n resolve, in either case", () => {
  assert.equal(keyToAction("y"), "WIN");
  assert.equal(keyToAction("Y"), "WIN");
  assert.equal(keyToAction("n"), "FAIL");
  assert.equal(keyToAction("N"), "FAIL");
});

test("down arrow moves to the next round", () => {
  assert.equal(keyToAction("ArrowDown"), "NEXT_ROUND");
});

test("e opens the editor", () => {
  assert.equal(keyToAction("e"), "EDIT");
  assert.equal(keyToAction("E"), "EDIT");
});

test("Enter, PageUp and PageDown are deliberately dead keys", () => {
  // These were considered and rejected. Do not add them back.
  assert.equal(keyToAction("Enter"), null);
  assert.equal(keyToAction("PageUp"), null);
  assert.equal(keyToAction("PageDown"), null);
});

test("unmapped keys are ignored", () => {
  for (const key of ["a", "Escape", "Tab", "ArrowUp", "1", "", undefined]) {
    assert.equal(keyToAction(key), null, `${key} should be unmapped`);
  }
});

test("the debouncer blocks a second call inside the window", () => {
  const allow = createDebouncer(DEBOUNCE_MS);
  assert.equal(allow(1000), true);
  assert.equal(allow(1000 + DEBOUNCE_MS - 1), false);
});

test("the debouncer allows a call once the window has passed", () => {
  const allow = createDebouncer(DEBOUNCE_MS);
  assert.equal(allow(1000), true);
  assert.equal(allow(1000 + DEBOUNCE_MS), true);
  assert.equal(allow(1000 + DEBOUNCE_MS + 10), false);
});

test("the first call is always allowed", () => {
  assert.equal(createDebouncer(DEBOUNCE_MS)(0), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/input.test.js`
Expected: FAIL — no export named `keyToAction`.

- [ ] **Step 3: Implement input**

```js
// src/player/input.js
// Keys and taps -> action types. The mapping and the debounce gate are pure.

export const DEBOUNCE_MS = 250;

// Enter, PageUp and PageDown are absent on purpose. See test/input.test.js.
const KEY_MAP = {
  " ": "ADVANCE",
  ArrowRight: "ADVANCE",
  ArrowLeft: "BACK",
  Backspace: "BACK",
  ArrowDown: "NEXT_ROUND",
  y: "WIN",
  n: "FAIL",
  e: "EDIT",
};

export function keyToAction(key) {
  if (typeof key !== "string" || key === "") return null;
  // Single letters are matched case-insensitively; named keys are not.
  const lookup = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[lookup] ?? null;
}

export function createDebouncer(ms) {
  let last = -Infinity;
  return function allow(now) {
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

export function bindInput({ stage, dispatch, getState }) {
  const allow = createDebouncer(DEBOUNCE_MS);

  function onKeyDown(event) {
    // A held key must not blow through all five clues.
    if (event.repeat) return;
    // While the editor is open the game must not react to anything.
    if (isTypingTarget(event.target) || document.querySelector(".editor")) return;
    const type = keyToAction(event.key);
    if (!type) return;
    event.preventDefault();
    if (!allow(event.timeStamp)) return;
    dispatch({ type });
  }

  function onPointerDown(event) {
    const target = event.target;

    // Buttons and the next bar carry their own meaning.
    if (target.closest(".btn-win")) return fire(event, "WIN");
    if (target.closest(".btn-fail")) return fire(event, "FAIL");
    if (target.closest(".next-bar")) return fire(event, "NEXT_ROUND");

    const rect = stage.getBoundingClientRect();
    if (getState().phase === "RESOLVED") return fire(event, "NEXT_ROUND");

    // The right 70% advances; the left 30% is dead space, which is what keeps
    // the top-left corner free for the editor's triple-tap.
    if (event.clientX - rect.left > rect.width * 0.3) fire(event, "ADVANCE");
  }

  function fire(event, type) {
    event.preventDefault();
    if (!allow(event.timeStamp)) return;
    dispatch({ type });
  }

  // Triple-tap the top-left corner opens the editor without a keyboard.
  let corner = [];
  function onCornerTap(event) {
    const rect = stage.getBoundingClientRect();
    const inCorner = event.clientX - rect.left < rect.width * 0.14
      && event.clientY - rect.top < rect.height * 0.16;
    if (!inCorner) { corner = []; return; }
    corner = corner.filter(t => event.timeStamp - t < 1200);
    corner.push(event.timeStamp);
    if (corner.length >= 3) {
      corner = [];
      dispatch({ type: "EDIT" });
    }
  }

  window.addEventListener("keydown", onKeyDown);
  stage.addEventListener("pointerdown", onCornerTap);
  stage.addEventListener("pointerdown", onPointerDown);

  return function unbind() {
    window.removeEventListener("keydown", onKeyDown);
    stage.removeEventListener("pointerdown", onCornerTap);
    stage.removeEventListener("pointerdown", onPointerDown);
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/input.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/input.js test/input.test.js
git commit -m "Map keys and taps to actions with a 250ms debounce"
```

---

### Task 10: Wire it together, with week one's real content

First point at which the game is playable. `main.js` is wiring only — it holds no game rules, since those all live in the reducer.

**Files:**
- Modify: `src/player/main.js`
- Modify: `src/data/week-2026-09-13.json` (replace the placeholder with the real seven rounds)

**Interfaces:**
- Consumes: everything from Tasks 2–9.
- Produces: `dist/index.html` is a playable game.

- [ ] **Step 1: Replace `src/data/week-2026-09-13.json` with the supplied content**

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
    { "answer": "Rebekah", "clues": [
      "An answer to prayer",
      "Animal lover",
      "Stay hydrated",
      "Born when their spouse almost died",
      "Eavesdropper" ] },
    { "answer": "Elijah", "clues": [
      "Appeared out of nowhere",
      "Wanted to die under a plant",
      "Listen to me",
      "DoorDash",
      "450 vs 1" ] },
    { "answer": "Lot's Wife", "clues": [
      "No name",
      "Content",
      "Jesus talked about them",
      "Terrible sense of direction",
      "King of condiments" ] },
    { "answer": "Uriah", "clues": [
      "A foreigner",
      "Refused to go home",
      "Slept at the palace door",
      "Carried their own death sentence",
      "Their spouse is really famous" ] },
    { "answer": "Samuel", "clues": [
      "An answer to prayer",
      "Divided household",
      "A good friend",
      "Multiple phone alarms",
      "Poured a lot of oil" ] },
    { "answer": "Achan", "clues": [
      "Tribe of Judah",
      "Confessed",
      "A sin that affected the whole nation",
      "My precious",
      "Expensive taste" ] },
    { "answer": "Tamar", "clues": [
      "A special garment",
      "Had some really awful brothers",
      "Two well-known characters have this name",
      "Come into my lair, the spider said",
      "Daughter of a king" ] }
  ]
}
```

- [ ] **Step 2: Write `src/player/main.js`**

```js
// src/player/main.js
// Wiring only. Every game rule lives in machine.js.

import { RESOLVED, initialState, reduce } from "./machine.js";
import { createStorage } from "./storage.js";
import { createEngine, getPreset } from "./effects.js";
import { viewModel, createRenderer } from "./render.js";
import { bindInput } from "./input.js";
import { openEditor } from "./editor.js";

const EMBEDDED_WEEK = JSON.parse(document.getElementById("game-data").textContent);

const stage = document.getElementById("stage");
const canvas = document.getElementById("fx");

const storage = createStorage(safeLocalStorage());
const renderer = createRenderer(stage);
const engine = createEngine(canvas, stage);

let state = initialState(storage.getActiveWeek(EMBEDDED_WEEK));

function safeLocalStorage() {
  // Merely touching localStorage can throw on iOS in some configurations.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function applyTheme(week) {
  const theme = week.theme ?? {};
  stage.dataset.bg = theme.background ?? "slate";
  stage.style.backgroundImage = theme.backgroundImage
    ? `url("${theme.backgroundImage}")`
    : "";
}

function loadWeek(week) {
  state = initialState(week);
  applyTheme(week);
  engine.stop();
  renderer.render(viewModel(state));
}

function dispatch(action) {
  if (action.type === "EDIT") {
    if (state.phase === "TITLE" || state.phase === "END") {
      openEditor({ storage, onLoad: loadWeek, embedded: EMBEDDED_WEEK });
    }
    return;
  }

  const next = reduce(state, action);
  if (next === state) return;
  state = next;

  renderer.render(viewModel(state));

  // The effect fires on the resolving transition only. Going back into an
  // answer must not replay it.
  if (state.justResolved && state.phase === RESOLVED) {
    const theme = state.week.theme ?? {};
    const id = state.outcome === "win"
      ? (theme.winEffect ?? "fireworks")
      : (theme.loseEffect ?? "ashfall");
    engine.play(getPreset(id));
  } else if (state.phase !== RESOLVED) {
    engine.stop();
  }
}

bindInput({ stage, dispatch, getState: () => state });
loadWeek(state.week);
```

- [ ] **Step 3: Build and play it**

Run: `python3 build.py && node --test`
Expected: build succeeds, all suites PASS.

Open `dist/index.html` in a desktop browser and walk the whole flow with the keyboard:

- Space from the title opens round 1 with clue 1 showing and "Worth 5 points".
- Four more spaces reveal clues 2–5; the counter reads down to "Worth 1 point"; a sixth space does nothing.
- The red X is dim until clue 5, then becomes usable.
- `Y` reveals the answer and plays fireworks.
- `←` returns to clue 5 **without** replaying the fireworks. This is the single most important thing to confirm by eye.
- `↓` starts round 2; `←` from clue 1 goes back to Rebekah's answer, still without an effect.
- Playing through all seven rounds reaches the end screen; space restarts.
- Clicking the right side of the stage advances; the check and X buttons work; the Next bar works.

- [ ] **Step 4: Commit**

```bash
git add src/player/main.js src/data/week-2026-09-13.json dist/index.html
git commit -m "Wire the player together with week one's content"
```

---
### Task 11: The content editor

The screen the moderator uses to load a new week without a rebuild. Two ways in — paste, or pick a `.json` file — plus a list of stored weeks to switch between or delete. Reachable only from the title and end screens (`E`, or a triple-tap in the top-left corner).

The date arithmetic and the week-object assembly are pure and tested; the panel itself is plain DOM.

**Files:**
- Modify: `src/player/editor.js`
- Test: `test/editor.test.js`

**Interfaces:**
- Consumes: `parseWeekText` from `parser.js`; a storage object from `storage.js`.
- Produces:
  - `nextSundayId(from: Date) -> "YYYY-MM-DD"` — the next Sunday, or `from` itself when it is already Sunday.
  - `buildWeek({ rounds, id, title, theme }) -> Week`
  - `openEditor({ storage, onLoad, embedded }) -> void`

- [ ] **Step 1: Write the failing tests**

```js
// test/editor.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSundayId, buildWeek } from "../src/player/editor.js";

const ROUNDS = [{ answer: "Rebekah", clues: ["a", "b", "c", "d", "e"] }];

test("finds the next Sunday", () => {
  // 2026-09-09 is a Wednesday.
  assert.equal(nextSundayId(new Date(2026, 8, 9)), "2026-09-13");
});

test("a Sunday maps to itself", () => {
  assert.equal(nextSundayId(new Date(2026, 8, 13)), "2026-09-13");
});

test("crosses a month and a year boundary", () => {
  assert.equal(nextSundayId(new Date(2026, 8, 29)), "2026-10-04");
  assert.equal(nextSundayId(new Date(2026, 11, 30)), "2027-01-03");
});

test("pads single-digit months and days", () => {
  assert.equal(nextSundayId(new Date(2027, 0, 5)), "2027-01-10");
});

test("builds a week with the current format version", () => {
  const week = buildWeek({ rounds: ROUNDS, id: "2026-09-13" });
  assert.equal(week.formatVersion, 1);
  assert.equal(week.id, "2026-09-13");
  assert.deepEqual(week.rounds, ROUNDS);
});

test("a missing title falls back to the id", () => {
  assert.equal(buildWeek({ rounds: ROUNDS, id: "2026-09-13" }).title, "2026-09-13");
  assert.equal(buildWeek({ rounds: ROUNDS, id: "x", title: "Kickoff" }).title, "Kickoff");
});

test("a missing theme gets complete defaults", () => {
  const { theme } = buildWeek({ rounds: ROUNDS, id: "x" });
  assert.equal(theme.background, "slate");
  assert.equal(theme.backgroundImage, null);
  assert.equal(theme.winEffect, "fireworks");
  assert.equal(theme.loseEffect, "ashfall");
});

test("a supplied theme is carried through and gap-filled", () => {
  const { theme } = buildWeek({ rounds: ROUNDS, id: "x", theme: { background: "plum" } });
  assert.equal(theme.background, "plum");
  assert.equal(theme.winEffect, "fireworks", "unspecified fields still get defaults");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/editor.test.js`
Expected: FAIL — no export named `nextSundayId`.

- [ ] **Step 3: Implement the editor**

```js
// src/player/editor.js
// Load a new week without rebuilding: paste it, or pick a .json file.

import { parseWeekText } from "./parser.js";

const DEFAULT_THEME = {
  background: "slate",
  backgroundImage: null,
  winEffect: "fireworks",
  loseEffect: "ashfall",
};

export function nextSundayId(from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildWeek({ rounds, id, title, theme }) {
  return {
    formatVersion: 1,
    id,
    title: title || id,
    theme: { ...DEFAULT_THEME, ...(theme ?? {}) },
    rounds,
  };
}

export function openEditor({ storage, onLoad, embedded }) {
  if (document.querySelector(".editor")) return;

  const panel = document.createElement("div");
  panel.className = "editor";
  panel.innerHTML = `
    <div class="editor-inner">
      <h2>Load a week</h2>
      <p class="editor-hint">Paste the week's list exactly as it arrived. Blank
        line between each character, the name on the first line, then five clues.</p>
      <textarea class="editor-text" rows="12" spellcheck="false"
        placeholder="Rebekah&#10;&#10;An answer to prayer&#10;Animal lover&#10;..."></textarea>
      <div class="editor-row">
        <button type="button" class="editor-btn" data-act="parse">Check it</button>
        <label class="editor-btn">
          Load a file<input type="file" accept="application/json,.json" hidden>
        </label>
        <button type="button" class="editor-btn" data-act="save" disabled>Use this week</button>
        <button type="button" class="editor-btn" data-act="close">Close</button>
      </div>
      <div class="editor-report" role="status"></div>
      <h3>Saved weeks</h3>
      <ul class="editor-weeks"></ul>
    </div>`;

  const textarea = panel.querySelector(".editor-text");
  const report = panel.querySelector(".editor-report");
  const saveButton = panel.querySelector('[data-act="save"]');
  const fileInput = panel.querySelector('input[type="file"]');
  const list = panel.querySelector(".editor-weeks");

  let pending = null;

  function say(html) { report.innerHTML = html; }

  function showParsed({ rounds, warnings }) {
    const lines = rounds.map(r => `<li><b>${escapeHtml(r.answer)}</b> — ${r.clues.length} clues</li>`);
    const warned = warnings.map(w => `<li class="warn">${escapeHtml(w)}</li>`);
    say(`<ul>${lines.join("")}${warned.join("")}</ul>`);
    saveButton.disabled = rounds.length === 0;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function currentTheme() {
    return (storage.getActiveWeek(embedded).theme) ?? DEFAULT_THEME;
  }

  function renderList() {
    const weeks = storage.loadWeeks();
    list.innerHTML = weeks.length
      ? weeks.map(w =>
          `<li><button type="button" data-use="${escapeHtml(w.id)}">${escapeHtml(w.title)}</button>
           <button type="button" class="del" data-del="${escapeHtml(w.id)}" aria-label="Delete">&times;</button></li>`
        ).reverse().join("")
      : "<li class=\"editor-hint\">Nothing saved yet — the built-in week is in use.</li>";
  }

  panel.addEventListener("click", event => {
    const act = event.target.dataset.act;
    const use = event.target.dataset.use;
    const del = event.target.dataset.del;

    if (act === "parse") {
      const parsed = parseWeekText(textarea.value);
      pending = parsed.rounds.length ? parsed : null;
      showParsed(parsed);
    } else if (act === "save" && pending) {
      const id = nextSundayId();
      const week = buildWeek({ rounds: pending.rounds, id, theme: currentTheme() });
      storage.saveWeek(week);
      close();
      onLoad(week);
    } else if (act === "close") {
      close();
    } else if (use) {
      storage.setActiveWeekId(use);
      const week = storage.getActiveWeek(embedded);
      close();
      onLoad(week);
    } else if (del) {
      storage.deleteWeek(del);
      renderList();
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const week = JSON.parse(await file.text());
      if (!Array.isArray(week.rounds) || week.rounds.length === 0) {
        throw new Error("that file has no rounds in it");
      }
      storage.saveWeek(buildWeek({
        rounds: week.rounds,
        id: week.id ?? nextSundayId(),
        title: week.title,
        theme: week.theme,
      }));
      close();
      onLoad(storage.getActiveWeek(embedded));
    } catch (error) {
      say(`<p class="warn">Could not read that file: ${escapeHtml(error.message)}</p>`);
    }
  });

  function close() {
    panel.remove();
  }

  renderList();
  document.body.append(panel);
  textarea.focus();
}
```

- [ ] **Step 4: Add the editor styles to `src/player/style.css`**

```css
.editor {
  position: fixed; inset: 0; z-index: 20;
  background: #0f1218; color: #e8eaf0;
  overflow: auto; padding: 4vh 4vw;
  font-family: var(--font);
}
.editor-inner { max-width: 760px; margin: 0 auto; }
.editor h2 { margin: 0 0 6px; font-size: 26px; }
.editor h3 { margin: 26px 0 8px; font-size: 18px; color: #9aa3b8; }
.editor-hint { margin: 0 0 12px; color: #9aa3b8; font-size: 14px; line-height: 1.5; }
.editor-text {
  width: 100%; font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #171b24; color: #e8eaf0; border: 2px solid #2b3140;
  border-radius: 10px; padding: 12px; resize: vertical;
}
.editor-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
.editor-btn {
  font: 600 15px var(--font); padding: 11px 18px; border-radius: 10px;
  border: 2px solid #3a4152; background: #232a38; color: #e8eaf0; cursor: pointer;
}
.editor-btn:disabled { opacity: 0.4; cursor: default; }
.editor-report ul { margin: 0; padding-left: 20px; line-height: 1.7; }
.editor-report .warn, .editor .warn { color: #ffc44d; }
.editor-weeks { list-style: none; margin: 0; padding: 0; }
.editor-weeks li { display: flex; gap: 8px; margin-bottom: 8px; }
.editor-weeks button {
  font: 600 15px var(--font); padding: 10px 14px; border-radius: 10px;
  border: 2px solid #3a4152; background: #232a38; color: #e8eaf0; cursor: pointer;
}
.editor-weeks button:first-child { flex: 1; text-align: left; }
.editor-weeks .del { color: #ff5c7a; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS across every suite.

- [ ] **Step 6: Try it in a browser**

Build, open `dist/index.html`, press `E` on the title screen. Paste two characters' worth of the sample, press *Check it*, confirm the preview lists them, press *Use this week*, and confirm the game now plays those rounds. Reload the page and confirm the pasted week is still active. Then delete it from the saved list and confirm the built-in week returns.

- [ ] **Step 7: Commit**

```bash
git add src/player/editor.js src/player/style.css test/editor.test.js dist/index.html
git commit -m "Add in-app editor for loading a week by paste or file"
```

---

### Task 12: Home-screen install, offline, and deployment

Turns the page into something that launches from the iPad home screen with no browser chrome — which is the entire reason for hosting, since iPadOS broadcasts the whole screen into Meet.

**A deliberate exception to the one-file rule:** offline support needs a service worker, and a service worker script must be a real same-origin file — it cannot be inlined or loaded from a `data:` URI. So the deployment is three files: `index.html`, `sw.js`, and `icon-180.png`. The game itself remains one self-contained file with no third-party or cross-origin requests; only the icon and the worker sit beside it. Uploading three files is no harder than one.

**Files:**
- Modify: `build.py` (emit `sw.js` and `icon-180.png`)
- Modify: `src/player/index.html` (icon link)
- Modify: `src/player/main.js` (register the worker)
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: everything.
- Produces: `dist/{index.html, sw.js, icon-180.png}` ready to upload.

- [ ] **Step 1: Write the failing tests**

Append to `test/build.test.js`:

```js
import { existsSync, statSync } from "node:fs";

test("build emits the install assets", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  assert.ok(existsSync("dist/sw.js"), "service worker missing");
  assert.ok(existsSync("dist/icon-180.png"), "home screen icon missing");
  assert.ok(statSync("dist/icon-180.png").size > 200, "icon looks empty");

  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
});

test("the service worker version changes when the page does", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const sw = readFileSync("dist/sw.js", "utf8");
  assert.match(sw, /const CACHE = "bible-clue-[0-9a-f]{8}"/,
    "the cache name must be content-derived so an update actually lands");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/build.test.js`
Expected: FAIL — `dist/sw.js` missing.

- [ ] **Step 3: Add the icon link to `src/player/index.html`**

Insert directly after the `theme-color` meta tag:

```html
<link rel="apple-touch-icon" href="icon-180.png">
```

- [ ] **Step 4: Register the worker at the end of `src/player/main.js`**

```js
// Offline support. Absent (harmlessly) when opened from a file:// URL.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Not fatal: the game runs perfectly well online.
    });
  });
}
```

- [ ] **Step 5: Extend `build.py`**

Add these imports at the top: `import hashlib`, `import struct`, `import zlib`.

Then add the two writers and call them from `main()` after `out.write_text(...)`:

```python
# A "?" drawn as a coarse mask, scaled up. Keeps the icon dependency-free.
GLYPH = [
    " ####### ",
    "###   ###",
    "##     ##",
    "       ##",
    "      ## ",
    "    ###  ",
    "   ##    ",
    "   ##    ",
    "   ##    ",
    "         ",
    "   ##    ",
    "   ##    ",
]

GROUND = (43, 52, 68)     # matches the slate palette
INK = (255, 196, 77)      # matches the accent


def write_png(path: pathlib.Path, size: int = 180) -> None:
    """Emit a flat icon with a scaled '?' glyph, using only the stdlib."""
    scale = 12
    glyph_w = len(GLYPH[0]) * scale
    glyph_h = len(GLYPH) * scale
    off_x = (size - glyph_w) // 2
    off_y = (size - glyph_h) // 2

    rows = []
    for y in range(size):
        row = bytearray()
        gy = (y - off_y) // scale
        for x in range(size):
            gx = (x - off_x) // scale
            on = (0 <= gy < len(GLYPH) and 0 <= gx < len(GLYPH[0])
                  and GLYPH[gy][gx] == "#")
            row += bytes(INK if on else GROUND)
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


SERVICE_WORKER = '''\
// Generated by build.py. The cache name is derived from the page contents, so
// publishing a new build invalidates the old one instead of serving it forever.
const CACHE = "bible-clue-{version}";
const ASSETS = ["./", "./index.html", "./icon-180.png"];

self.addEventListener("install", event => {{
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener("activate", event => {{
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

self.addEventListener("fetch", event => {{
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {{
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return response;
      }})
      .catch(() => caches.match(event.request).then(hit => hit || caches.match("./index.html")))
  );
}});
'''


def write_service_worker(path: pathlib.Path, html: str) -> None:
    version = hashlib.sha256(html.encode("utf-8")).hexdigest()[:8]
    path.write_text(SERVICE_WORKER.format(version=version), encoding="utf-8")
```

Call them at the end of `main()`:

```python
    write_service_worker(out.parent / "sw.js", html)
    write_png(out.parent / "icon-180.png")
    print(f"wrote {out.parent / 'sw.js'} and {out.parent / 'icon-180.png'}")
```

- [ ] **Step 6: Run every test**

Run: `python3 build.py && node --test`
Expected: PASS across every suite.

- [ ] **Step 7: Deploy and install**

1. Go to `https://app.netlify.com/drop` and drag the whole `dist/` folder onto it. Copy the URL it gives back. (Cloudflare Pages works identically if preferred; GitHub Pages works but is openly public.)
2. On the iPad, open that URL in **Safari**. It must be Safari — Chrome on iOS cannot add to the home screen.
3. Share → **Add to Home Screen**. Confirm the icon and name look right.
4. Close Safari entirely and launch from the new icon. **Confirm there is no address bar and no toolbar.** This is the whole point of the exercise; if chrome is still visible, stop and report it rather than continuing.
5. Turn on Airplane Mode and relaunch from the icon. The game must still run.

- [ ] **Step 8: Run the manual iPad checklist**

Upload `ipad-test.html` alongside the game and open it from the installed app's origin. Record, in the commit message or an issue:

- whether fullscreen is reported as available in standalone mode;
- the exact `event.code` values the Bluetooth keyboard emits for space, the arrows, `Y` and `N` — if any differ from the assumptions in `input.js`, that is a bug to fix now, not during a meeting;
- the sustained particle frame rate.

Then confirm the file picker works: press `E`, tap *Load a file*, and pick a `.json` from the SanDisk drive. **If the picker misbehaves in standalone mode, that is expected to be possible** (spec §11) — the paste path covers it, and the fix is to remove the picker, not to chase it.

- [ ] **Step 9: Dry run over Google Meet**

Share the iPad screen into a Meet call with one other participant and play two rounds — one won, one lost. Ask them, specifically, whether the effects read as intended or as grey mush, and whether the clue text is comfortable to read in their tile. Retune preset counts, radii and durations in `effects.js` if not; they are data, and the budget tests will keep any change honest.

- [ ] **Step 10: Commit**

```bash
git add build.py src/player/index.html src/player/main.js test/build.test.js dist/
git commit -m "Add home screen install, offline caching and deploy assets"
```

---

## Done when

- `node --test` passes every suite.
- The game launches from the iPad home screen with no browser chrome and runs in Airplane Mode.
- A full seven-round playthrough works from the Bluetooth keyboard, and going back never replays an effect.
- A new week can be loaded by pasting into the editor, and it survives a relaunch.
- A second participant in a Meet call confirms the effects and text read clearly.
