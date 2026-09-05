# Bible Clue Game — Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the weekly authoring tool — a single self-contained HTML file where someone who knows no HTML pastes the week's email, picks a background and two effects, sees a live preview, and downloads a week file the game can load.

**Architecture:** The builder reuses the player's own tested modules rather than reimplementing them — the same `parseWeekText`, the same `viewModel`, the same effect presets and particle engine, the same stylesheet. It adds one new pure module (`builder.js`) for turning form state into a week object, plus a thin DOM layer. `build.py` gains a second output.

**Tech Stack:** Vanilla ES modules, `node --test` (Node 24), Python 3 stdlib. **No npm packages.**

**Spec:** `docs/superpowers/specs/2026-09-05-bible-clue-game-design.md` (§8)

**Prerequisite:** The player is built, merged to `main`, and deployed at
https://stephengenusa.github.io/MariasBibleGame/

## Global Constraints

Every task's requirements implicitly include this section.

- **No npm dependencies, ever.** No `npm install`, no lockfile.
- **Node ≥ 24** for `node --test`; **Python 3, stdlib only** for `build.py`.
- **`dist/builder.html` is one self-contained file** with no third-party or cross-origin requests. It must work both by double-clicking from `file://` on the PC and when served from the Pages site.
- **Reuse the player's modules.** Do not reimplement parsing, the view model, the palettes, or the effects. If the builder needs something the player already does, share it.
- **Fonts:** system stack only.
- The builder's user is assumed to know **nothing** about HTML, CSS, JavaScript, JSON, or the command line.

## Scope change from spec §8

The spec had the builder emit two artifacts: a complete rebuilt `index.html`
and a week file. **The full-app output is dropped.** Reasons:

- The game is now hosted and installed to the iPad home screen. A freshly
  built HTML file has nowhere useful to go.
- Background and effect choices live inside the week's `theme`, so a week file
  alone changes them. That was the only reason the full app was needed weekly.
- Embedding the whole player inside the builder doubles the artifact and goes
  stale the moment the player changes.
- Rebuilding the game itself is already `python3 build.py` followed by
  `git subtree push --prefix dist origin gh-pages` — a developer task, not a
  weekly one.

The builder therefore has exactly one output: **`week-YYYY-MM-DD.json`**.

## File Structure

```
src/player/week.js              nextSundayId + buildWeek, moved out of editor.js
                                so the builder can share them
src/builder/builder.html        shell with inline placeholders
src/builder/builder.css         builder-only chrome (the stage preview reuses style.css)
src/builder/builder.js          form state -> week object, plus the DOM layer
build.py                        gains a second output: dist/builder.html
dist/builder.html               the shipped tool
test/week.test.js               moved from the editor's half of test/editor.test.js
test/builder.test.js
```

### Module load order for the builder bundle

```
parser.js -> machine.js -> week.js -> effects.js -> render.js -> builder.js
```

`storage.js`, `input.js`, `editor.js` and `main.js` are player-only and must not
be inlined into the builder.

---

### Task 1: Share `nextSundayId` and `buildWeek`

Both the in-app editor and the builder need to name a week and assemble a week
object. Extracting them now prevents two implementations drifting apart.

**Files:**
- Create: `src/player/week.js`
- Modify: `src/player/editor.js` (import instead of define)
- Modify: `build.py` (add `week.js` to `MODULE_ORDER`)
- Create: `test/week.test.js`
- Modify: `test/editor.test.js` (remove the moved tests)

**Interfaces:**
- Consumes: nothing.
- Produces: `nextSundayId(from?: Date) -> "YYYY-MM-DD"`, `buildWeek({rounds, id, title, theme}) -> Week`, `DEFAULT_THEME`. Behaviour is unchanged; only the file moves.

- [ ] **Step 1: Move the tests, unchanged**

Create `test/week.test.js` containing the eight tests currently in
`test/editor.test.js`, with the import changed to:

```js
import { nextSundayId, buildWeek } from "../src/player/week.js";
```

Then delete those eight tests from `test/editor.test.js`. That file becomes
empty of tests, so delete `test/editor.test.js` entirely — the editor's DOM
half was never unit tested and the pure half now lives in `week.test.js`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/week.test.js`
Expected: FAIL — cannot find module `../src/player/week.js`.

- [ ] **Step 3: Create `src/player/week.js`**

```js
// Naming and assembling a week. Shared by the in-app editor and the builder.

export const DEFAULT_THEME = {
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
```

- [ ] **Step 4: Strip them out of `src/player/editor.js`**

Delete the `DEFAULT_THEME` constant and both function definitions, and add at
the top, below the existing parser import:

```js
import { DEFAULT_THEME, nextSundayId, buildWeek } from "./week.js";
```

- [ ] **Step 5: Add `week.js` to the player's module order in `build.py`**

```python
MODULE_ORDER = [
    "parser.js", "machine.js", "week.js", "storage.js", "effects.js",
    "render.js", "input.js", "editor.js", "main.js",
]
```

- [ ] **Step 6: Run everything**

Run: `python3 build.py && node --test`
Expected: PASS. The total drops by one suite name but the assertion count is unchanged — nothing was rewritten, only moved.

- [ ] **Step 7: Commit**

```bash
git add src/player/week.js src/player/editor.js build.py test/week.test.js
git rm test/editor.test.js
git commit -m "Extract week naming and assembly for sharing with the builder"
```

---

### Task 2: Builder shell and a second build output

Gets an empty but real `dist/builder.html` building, so everything after this
is content rather than plumbing.

**Files:**
- Create: `src/builder/builder.html`
- Create: `src/builder/builder.css`
- Create: `src/builder/builder.js` (stub)
- Modify: `build.py`
- Modify: `test/build.test.js`

**Interfaces:**
- Consumes: `read_module` from `build.py`.
- Produces: `python3 build.py` also writes `dist/builder.html`.

- [ ] **Step 1: Write the failing test**

Append to `test/build.test.js`:

```js
test("build produces a self-contained builder", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/builder.html", "utf8");

  assert.ok(!/<!--INLINE:/.test(html), "an INLINE placeholder was left unreplaced");
  assert.ok(!/^\s*(import|export)\s/m.test(html), "module syntax survived inlining");
  assert.ok(!/(?:src|href)=["']https?:/.test(html), "the builder references an external resource");

  // Player-only modules must not leak into the builder.
  for (const banned of ["storage.js", "input.js", "editor.js", "main.js"]) {
    assert.ok(!html.includes(`/* ---------- ${banned} ---------- */`),
      `${banned} does not belong in the builder`);
  }
  // Shared modules must be present, in dependency order.
  let cursor = -1;
  for (const name of ["parser.js", "machine.js", "week.js", "effects.js", "render.js", "builder.js"]) {
    const at = html.indexOf(`/* ---------- ${name} ---------- */`);
    assert.ok(at > cursor, `${name} is missing or out of dependency order`);
    cursor = at;
  }
});

test("the builder's bundle is valid JavaScript", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/builder.html", "utf8");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, "no module script found in the builder");

  const tmp = "dist/.builder-check.mjs";
  writeFileSync(tmp, match[1]);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } finally {
    rmSync(tmp, { force: true });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `ENOENT: dist/builder.html`.

- [ ] **Step 3: Create the builder shell**

`src/builder/builder.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bible Clue Game — Week Builder</title>
<!--INLINE:playercss-->
<!--INLINE:css-->
</head>
<body>
<div class="wrap">
  <h1>Week Builder</h1>
  <p class="sub">Paste this week's list, choose how it looks, and download the file.</p>
  <div id="app"></div>
</div>
<script type="module">
<!--INLINE:js-->
</script>
</body>
</html>
```

`src/builder/builder.js` — a stub for now:

```js
// Form state -> week object, plus the DOM layer. Filled in from Task 3.
```

`src/builder/builder.css` may be empty; Task 4 fills it.

- [ ] **Step 4: Teach `build.py` to emit it**

Add near `MODULE_ORDER`:

```python
BUILDER_SRC = ROOT / "src" / "builder"

# The builder shares the player's logic. Player-only modules are excluded.
BUILDER_MODULE_ORDER = [
    "parser.js", "machine.js", "week.js", "effects.js", "render.js",
]
```

Add a function beside `main()`:

```python
def build_builder() -> None:
    """Emit dist/builder.html, sharing the player's modules."""
    html = (BUILDER_SRC / "builder.html").read_text(encoding="utf-8")
    player_css = (SRC / "style.css").read_text(encoding="utf-8")
    builder_css = (BUILDER_SRC / "builder.css").read_text(encoding="utf-8")

    js = "\n".join(read_module(name) for name in BUILDER_MODULE_ORDER)
    js += "\n" + read_module_from(BUILDER_SRC, "builder.js")

    if re.search(r"^[ \t]*(import|export)\s", js, re.M):
        sys.exit("module syntax survived inlining in the builder")

    html = html.replace("<!--INLINE:playercss-->", f"<style>\n{player_css}\n</style>")
    html = html.replace("<!--INLINE:css-->", f"<style>\n{builder_css}\n</style>")
    html = html.replace("<!--INLINE:js-->", js)

    leftover = PLACEHOLDER_RE.search(html)
    if leftover:
        sys.exit(f"unreplaced placeholder in the builder: {leftover.group(0)}")

    out = ROOT / "dist" / "builder.html"
    out.write_text(html, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)} ({len(html):,} bytes)")
```

`read_module` currently hard-codes `SRC`. Generalise it so both directories
work — replace its first two lines with a delegating pair:

```python
def read_module(name: str) -> str:
    return read_module_from(SRC, name)


def read_module_from(directory: pathlib.Path, name: str) -> str:
    """Strip module syntax so the file can be concatenated into one script."""
    path = directory / name
    text = path.read_text(encoding="utf-8")
    # ... the existing body, unchanged from here down ...
```

Then call it at the end of `main()`, after the player's assets:

```python
    build_builder()
```

- [ ] **Step 5: Run to verify it passes**

Run: `python3 build.py && node --test`
Expected: PASS. `dist/builder.html` exists and opens to a heading in a browser.

- [ ] **Step 6: Commit**

```bash
git add src/builder build.py test/build.test.js dist/builder.html
git commit -m "Emit a second build output for the week builder"
```

---
### Task 3: Form state to week object

The one piece of real logic the builder adds. Pure, DOM-free, tested.

The validation matters more than it looks: the form's two effect dropdowns must
not accept each other's values. Picking `ashfall` as a *win* effect would give
the moderator grey flakes for a correct answer, and nothing downstream would
catch it.

**Files:**
- Modify: `src/builder/builder.js`
- Create: `test/builder.test.js`

**Interfaces:**
- Consumes: `parseWeekText`; `nextSundayId`, `buildWeek` from `week.js`; `BACKGROUNDS` from `render.js`; `WIN_PRESETS`, `LOSE_PRESETS` from `effects.js`.
- Produces:
  - `weekFromForm({text, id, title, background, winEffect, loseEffect}) -> { week, warnings, ok }` — `ok` is false when nothing parsed, in which case `week` is still a valid object with zero rounds.
  - `filenameFor(week) -> string` — e.g. `"week-2026-09-13.json"`.

- [ ] **Step 1: Write the failing tests**

```js
// test/builder.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekFromForm, filenameFor } from "../src/builder/builder.js";

const TEXT = [
  "Rebekah", "", "An answer to prayer", "Animal lover", "Stay hydrated",
  "Born when their spouse almost died", "Eavesdropper", "",
  "Elijah", "", "Appeared out of nowhere", "Wanted to die under a plant",
  "Listen to me", "DoorDash", "450 vs 1",
].join("\n");

const FORM = {
  text: TEXT,
  id: "2026-09-20",
  background: "plum",
  winEffect: "streamers",
  loseEffect: "iris",
};

test("builds a complete week from a filled-in form", () => {
  const { week, ok, warnings } = weekFromForm(FORM);
  assert.equal(ok, true);
  assert.deepEqual(warnings, []);
  assert.equal(week.formatVersion, 1);
  assert.equal(week.id, "2026-09-20");
  assert.equal(week.rounds.length, 2);
  assert.equal(week.rounds[0].answer, "Rebekah");
  assert.equal(week.theme.background, "plum");
  assert.equal(week.theme.winEffect, "streamers");
  assert.equal(week.theme.loseEffect, "iris");
});

test("an unknown background falls back to slate", () => {
  const { week } = weekFromForm({ ...FORM, background: "chartreuse" });
  assert.equal(week.theme.background, "slate");
});

test("a lose effect cannot be used as a win effect", () => {
  // Picking ashfall for a correct answer would give grey flakes for a win.
  const { week } = weekFromForm({ ...FORM, winEffect: "ashfall" });
  assert.equal(week.theme.winEffect, "fireworks");
});

test("a win effect cannot be used as a lose effect", () => {
  const { week } = weekFromForm({ ...FORM, loseEffect: "fireworks" });
  assert.equal(week.theme.loseEffect, "ashfall");
});

test("unknown effects fall back to the defaults", () => {
  const { week } = weekFromForm({ ...FORM, winEffect: "sparkles", loseEffect: "gloom" });
  assert.equal(week.theme.winEffect, "fireworks");
  assert.equal(week.theme.loseEffect, "ashfall");
});

test("a missing id defaults to the next Sunday", () => {
  const { week } = weekFromForm({ ...FORM, id: "" });
  assert.match(week.id, /^\d{4}-\d{2}-\d{2}$/);
});

test("empty text is not ok, but still yields a usable object", () => {
  const { week, ok, warnings } = weekFromForm({ ...FORM, text: "   " });
  assert.equal(ok, false);
  assert.deepEqual(week.rounds, []);
  assert.ok(warnings.length > 0);
});

test("parser warnings are passed straight through", () => {
  const { warnings, ok } = weekFromForm({ ...FORM, text: "Achan\n\nTribe of Judah\nConfessed" });
  assert.equal(ok, true, "a short round is still usable");
  assert.match(warnings[0], /2 clues/);
});

test("the filename is derived from the week id", () => {
  assert.equal(filenameFor({ id: "2026-09-20" }), "week-2026-09-20.json");
});

test("the filename is safe even for a hand-typed id", () => {
  assert.equal(filenameFor({ id: "Sept 20 / kickoff!" }), "week-Sept-20-kickoff.json");
  assert.equal(filenameFor({ id: "" }), "week.json");
  assert.equal(filenameFor({}), "week.json");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/builder.test.js`
Expected: FAIL — no export named `weekFromForm`.

- [ ] **Step 3: Implement**

Replace the stub `src/builder/builder.js` with:

```js
// Form state -> week object, plus the DOM layer.

import { parseWeekText } from "../player/parser.js";
import { nextSundayId, buildWeek, DEFAULT_THEME } from "../player/week.js";
import { BACKGROUNDS } from "../player/render.js";
import { WIN_PRESETS, LOSE_PRESETS } from "../player/effects.js";

const WIN_IDS = WIN_PRESETS.map(p => p.id);
const LOSE_IDS = LOSE_PRESETS.map(p => p.id);

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function weekFromForm({ text, id, title, background, winEffect, loseEffect }) {
  const { rounds, warnings } = parseWeekText(text);

  const week = buildWeek({
    rounds,
    id: id?.trim() || nextSundayId(),
    title,
    theme: {
      background: oneOf(background, BACKGROUNDS, DEFAULT_THEME.background),
      backgroundImage: null,
      // The two lists are checked separately so neither can borrow the other's
      // presets: ashfall for a win would be grey flakes on a correct answer.
      winEffect: oneOf(winEffect, WIN_IDS, DEFAULT_THEME.winEffect),
      loseEffect: oneOf(loseEffect, LOSE_IDS, DEFAULT_THEME.loseEffect),
    },
  });

  return { week, warnings, ok: rounds.length > 0 };
}

export function filenameFor(week) {
  const slug = String(week?.id ?? "")
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `week-${slug}.json` : "week.json";
}
```

Note the imports reach across into `../player/`. `build.py` inlines by name and
strips the import lines, so the path only matters to `node --test`, which
resolves it fine.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/builder.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/builder/builder.js test/builder.test.js
git commit -m "Turn builder form state into a validated week object"
```

---

### Task 4: Paste, check, and see what parsed

The first half of the interface. Everything here is for a person who has never
seen JSON and should never have to.

**Files:**
- Modify: `src/builder/builder.html`
- Modify: `src/builder/builder.js` (append the DOM layer)
- Modify: `src/builder/builder.css`

**Interfaces:**
- Consumes: `weekFromForm`.
- Produces: a `readForm()` helper and a `refresh()` function that other tasks extend.

- [ ] **Step 1: Add the form markup**

Replace `<div id="app"></div>` in `src/builder/builder.html` with:

```html
<section class="panel">
  <label class="field">
    <span class="field-label">Which Sunday is this for?</span>
    <input type="date" id="week-id">
  </label>
</section>

<section class="panel">
  <h2>This week's characters</h2>
  <p class="help">Paste the list exactly as it arrived in the email. Each
    character's name on its own line, a blank line, then their five clues.
    You do not need to tidy anything up.</p>
  <textarea id="week-text" rows="14" spellcheck="false"
    placeholder="Rebekah&#10;&#10;An answer to prayer&#10;Animal lover&#10;Stay hydrated&#10;Born when their spouse almost died&#10;Eavesdropper"></textarea>
  <div id="parse-report" class="report" role="status"></div>
</section>
```

- [ ] **Step 2: Append the DOM layer to `src/builder/builder.js`**

```js
/* ---------- interface ---------- */

const $ = id => document.getElementById(id);

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Filled in by later tasks; kept here so refresh() has one place to read from.
const state = {
  background: DEFAULT_THEME.background,
  winEffect: DEFAULT_THEME.winEffect,
  loseEffect: DEFAULT_THEME.loseEffect,
};

function readForm() {
  return {
    text: $("week-text").value,
    id: $("week-id").value,
    background: state.background,
    winEffect: state.winEffect,
    loseEffect: state.loseEffect,
  };
}

function renderReport({ week, warnings, ok }) {
  const report = $("parse-report");

  if (!ok) {
    report.innerHTML = `<p class="bad">Nothing recognised yet. Paste the week's
      list above — name, blank line, five clues.</p>`;
    return;
  }

  const rounds = week.rounds.map(r => `
    <li>
      <b>${escapeHtml(r.answer)}</b>
      <span class="count ${r.clues.length === 5 ? "" : "off"}">${r.clues.length} clues</span>
    </li>`).join("");

  const notes = warnings.map(w => `<li class="warn">${escapeHtml(w)}</li>`).join("");

  report.innerHTML = `
    <p class="good">${week.rounds.length} character${week.rounds.length === 1 ? "" : "s"} found.</p>
    <ul class="rounds">${rounds}</ul>
    ${notes ? `<ul class="notes">${notes}</ul>` : ""}`;
}

function refresh() {
  const result = weekFromForm(readForm());
  renderReport(result);
  return result;
}

$("week-text").addEventListener("input", refresh);
$("week-id").addEventListener("input", refresh);
$("week-id").value = nextSundayId();
refresh();
```

Parsing on every keystroke is affordable — the parser is a few string
operations over at most a few hundred lines — and it removes a "Check it"
button the user would otherwise have to know to press.

- [ ] **Step 3: Style it**

Append to `src/builder/builder.css`:

```css
:root { color-scheme: light dark; }

body {
  margin: 0; background: #f5f6f8; color: #1a1d24;
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  body { background: #12141a; color: #e8eaf0; }
}

.wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.01em; }
.sub { margin: 0 0 28px; color: #6f7891; }

.panel {
  background: #fff; border: 1px solid #dfe3ea; border-radius: 14px;
  padding: 20px; margin-bottom: 18px;
}
@media (prefers-color-scheme: dark) {
  .panel { background: #1a1e27; border-color: #2b3140; }
}
.panel h2 { margin: 0 0 4px; font-size: 19px; }
.help { margin: 0 0 14px; color: #6f7891; font-size: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-weight: 600; font-size: 14px; }
input[type="date"], textarea {
  font: inherit; color: inherit; background: #fbfcfd;
  border: 2px solid #dfe3ea; border-radius: 10px; padding: 10px 12px;
}
@media (prefers-color-scheme: dark) {
  input[type="date"], textarea { background: #12151c; border-color: #2b3140; }
}
textarea { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; resize: vertical; }

.report { margin-top: 14px; font-size: 14px; }
.report .good { margin: 0 0 8px; font-weight: 700; color: #17794a; }
.report .bad { margin: 0; color: #6f7891; }
.rounds, .notes { margin: 0; padding-left: 20px; }
.rounds li { margin-bottom: 3px; }
.count { color: #6f7891; font-size: 13px; margin-left: 8px; }
.count.off { color: #b26a00; font-weight: 700; }
.warn { color: #b26a00; }
```

- [ ] **Step 4: Try it**

Run `python3 build.py`, open `dist/builder.html`, and paste the whole week-one
email including the rules preamble. Confirm seven characters are listed, each
showing "5 clues", with no warnings and the rules block ignored. Then delete a
clue and confirm that character turns amber and a warning appears.

- [ ] **Step 5: Commit**

```bash
git add src/builder dist/builder.html
git commit -m "Add the builder's paste box and live parse report"
```

---
### Task 5: Background palette and a live stage preview

The preview reuses the player's real `viewModel`, `createRenderer` and
stylesheet, so what the builder shows is what the game will show. Anything less
would be a second implementation that drifts.

**Files:**
- Modify: `src/builder/builder.html`
- Modify: `src/builder/builder.js`
- Modify: `src/builder/builder.css`

**Interfaces:**
- Consumes: `BACKGROUNDS`, `viewModel`, `createRenderer` from `render.js`; `initialState`, `reduce` from `machine.js`.
- Produces: `state.background` is set by the palette; `refresh()` also repaints the preview.

- [ ] **Step 1: Add the markup**

Append inside `.wrap`, after the paste panel:

```html
<section class="panel">
  <h2>Background</h2>
  <p class="help">Flat colours read best once Google Meet has compressed the
    picture. Gradients and photos tend to smear.</p>
  <div id="palette" class="palette"></div>
</section>

<section class="panel">
  <h2>Preview</h2>
  <p class="help">This is the real game screen, showing the third clue of your
    first character.</p>
  <div class="preview-frame">
    <div id="preview" class="stage" data-bg="slate">
      <header class="hud"><span class="hud-round"></span><span class="hud-points"></span></header>
      <ol class="clues">
        <li class="clue"><span class="clue-num">1</span><span class="clue-text"></span></li>
        <li class="clue"><span class="clue-num">2</span><span class="clue-text"></span></li>
        <li class="clue"><span class="clue-num">3</span><span class="clue-text"></span></li>
        <li class="clue"><span class="clue-num">4</span><span class="clue-text"></span></li>
        <li class="clue"><span class="clue-num">5</span><span class="clue-text"></span></li>
      </ol>
      <div class="answer" hidden><span class="answer-text"></span></div>
      <footer class="controls" hidden>
        <button class="btn btn-win" type="button" tabindex="-1">&check;</button>
        <button class="btn btn-fail" type="button" tabindex="-1">&times;</button>
      </footer>
      <div class="next-bar" hidden></div>
      <section class="screen screen-title" hidden></section>
      <section class="screen screen-end" hidden></section>
    </div>
    <canvas id="preview-fx"></canvas>
  </div>
</section>
```

- [ ] **Step 2: Wire up the palette and preview**

Append to `src/builder/builder.js`:

```js
/* ---------- background palette ---------- */

const paletteEl = $("palette");
paletteEl.innerHTML = BACKGROUNDS.map(id => `
  <button type="button" class="swatch stage" data-bg="${id}" data-pick="${id}"
          aria-label="${id}"><span>Aa</span></button>`).join("");

paletteEl.addEventListener("click", event => {
  const pick = event.target.closest("[data-pick]");
  if (!pick) return;
  state.background = pick.dataset.pick;
  for (const el of paletteEl.querySelectorAll(".swatch")) {
    el.classList.toggle("is-on", el.dataset.pick === state.background);
  }
  refresh();
});

/* ---------- live preview ---------- */

const previewEl = $("preview");
const previewRenderer = createRenderer(previewEl);

function renderPreview(week) {
  previewEl.dataset.bg = week.theme.background;

  // Show a real mid-round screen: round 1, third clue revealed.
  const sample = week.rounds.length
    ? week
    : { rounds: [{ answer: "Rebekah", clues: [
        "An answer to prayer", "Animal lover", "Stay hydrated",
        "Born when their spouse almost died", "Eavesdropper"] }] };

  let s = reduce(initialState(sample), { type: "ADVANCE" });
  s = reduce(s, { type: "ADVANCE" });
  s = reduce(s, { type: "ADVANCE" });
  previewRenderer.render(viewModel(s));
}
```

Then extend `refresh()` so it repaints the preview — replace the existing
function with:

```js
function refresh() {
  const result = weekFromForm(readForm());
  renderReport(result);
  renderPreview(result.week);
  return result;
}
```

- [ ] **Step 3: Style the palette and frame**

Append to `src/builder/builder.css`:

```css
.palette { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 10px; }
.swatch {
  all: unset;
  aspect-ratio: 16 / 9; border-radius: 10px; cursor: pointer;
  display: grid; place-items: center;
  background: var(--bg); color: var(--fg);
  font-weight: 800; font-size: 17px;
  outline: 3px solid transparent; outline-offset: 2px;
}
.swatch.is-on { outline-color: #3b82f6; }

/* The preview must not inherit the player's fixed, full-window stage rules. */
.preview-frame { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; }
.preview-frame .stage { position: absolute; inset: 0; margin: 0; max-width: none; max-height: none; }
.preview-frame canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
```

The last rule matters: the player's `.stage` is positioned against the whole
window. Inside the builder it has to be scoped to its frame instead.

- [ ] **Step 4: Try it**

Rebuild and confirm all eight swatches appear, clicking one outlines it and
recolours the preview, and the preview shows three clues with "Worth 3 points".

- [ ] **Step 5: Commit**

```bash
git add src/builder dist/builder.html
git commit -m "Add background palette and a live stage preview"
```

---

### Task 6: Effect pickers that actually play

Eleven presets are too many to choose from a dropdown label. Each one gets a
button that plays it over the preview.

**Files:**
- Modify: `src/builder/builder.html`
- Modify: `src/builder/builder.js`
- Modify: `src/builder/builder.css`

**Interfaces:**
- Consumes: `WIN_PRESETS`, `LOSE_PRESETS`, `getPreset`, `createEngine` from `effects.js`.
- Produces: `state.winEffect` and `state.loseEffect`.

- [ ] **Step 1: Add the markup**

Append after the preview panel:

```html
<section class="panel">
  <h2>When someone gets it right</h2>
  <div id="win-effects" class="effects"></div>
</section>

<section class="panel">
  <h2>When nobody gets it</h2>
  <div id="lose-effects" class="effects"></div>
</section>
```

- [ ] **Step 2: Wire them up**

Append to `src/builder/builder.js`:

```js
/* ---------- effect pickers ---------- */

const engine = createEngine($("preview-fx"), previewEl);

function mountEffects(containerId, presets, key) {
  const el = $(containerId);
  el.innerHTML = presets.map(p => `
    <div class="effect" data-id="${p.id}">
      <button type="button" class="effect-pick" data-pick-effect="${p.id}">${p.label}</button>
      <button type="button" class="effect-play" data-play="${p.id}" aria-label="Preview ${p.label}">&#9654;</button>
    </div>`).join("");

  el.addEventListener("click", event => {
    const pick = event.target.closest("[data-pick-effect]");
    const play = event.target.closest("[data-play]");

    if (pick) {
      state[key] = pick.dataset.pickEffect;
      for (const node of el.querySelectorAll(".effect")) {
        node.classList.toggle("is-on", node.dataset.id === state[key]);
      }
      refresh();
      engine.play(getPreset(state[key]));      // choosing also previews it
    } else if (play) {
      engine.play(getPreset(play.dataset.play));
    }
  });

  // Reflect the starting selection.
  for (const node of el.querySelectorAll(".effect")) {
    node.classList.toggle("is-on", node.dataset.id === state[key]);
  }
}

mountEffects("win-effects", WIN_PRESETS, "winEffect");
mountEffects("lose-effects", LOSE_PRESETS, "loseEffect");
```

The two pickers are mounted from separate lists, which is what makes it
impossible to choose `ashfall` for a win through the interface. Task 3's
validation is the second line of defence, for a hand-edited file.

- [ ] **Step 3: Style them**

```css
.effects { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.effect { display: flex; border: 2px solid #dfe3ea; border-radius: 10px; overflow: hidden; }
@media (prefers-color-scheme: dark) { .effect { border-color: #2b3140; } }
.effect.is-on { border-color: #3b82f6; }
.effect-pick { all: unset; flex: 1; padding: 12px 14px; cursor: pointer; font-weight: 600; }
.effect.is-on .effect-pick { background: #3b82f6; color: #fff; }
.effect-play { all: unset; padding: 12px 14px; cursor: pointer; color: #6f7891; }
.effect-play:hover { color: inherit; }
```

- [ ] **Step 4: Try every one of them**

Rebuild, then play all eleven presets over a dark background and a light one.
Confirm each is visually distinct, none is so dense it hides the clue text, and
`deflate` and `iris` visibly do something despite emitting no particles.

- [ ] **Step 5: Commit**

```bash
git add src/builder dist/builder.html
git commit -m "Add playable effect pickers for wins and misses"
```

---

### Task 7: Download the week, and load one back

The output, plus the round trip that makes "same as last week but swap two
characters" a twenty-second job.

**Files:**
- Modify: `src/builder/builder.html`
- Modify: `src/builder/builder.js`
- Modify: `src/builder/builder.css`

**Interfaces:**
- Consumes: `filenameFor`, `weekFromForm`.
- Produces: a downloaded `week-YYYY-MM-DD.json`; `loadWeekIntoForm(week)`.

- [ ] **Step 1: Add the markup**

```html
<section class="panel panel-out">
  <button type="button" id="download" class="primary" disabled>Download this week</button>
  <label class="secondary">
    Open a week I made before<input type="file" id="open-week" accept="application/json,.json" hidden>
  </label>
  <p class="help" id="out-help"></p>
</section>
```

- [ ] **Step 2: Wire it up**

```js
/* ---------- output ---------- */

function loadWeekIntoForm(week) {
  // Rebuild the paste text from the rounds so the box stays the source of truth.
  $("week-text").value = week.rounds
    .map(r => [r.answer, "", ...r.clues].join("\n"))
    .join("\n\n");
  if (week.id) $("week-id").value = week.id;

  const theme = week.theme ?? {};
  state.background = theme.background ?? state.background;
  state.winEffect = theme.winEffect ?? state.winEffect;
  state.loseEffect = theme.loseEffect ?? state.loseEffect;

  for (const el of paletteEl.querySelectorAll(".swatch")) {
    el.classList.toggle("is-on", el.dataset.pick === state.background);
  }
  for (const [id, key] of [["win-effects", "winEffect"], ["lose-effects", "loseEffect"]]) {
    for (const node of $(id).querySelectorAll(".effect")) {
      node.classList.toggle("is-on", node.dataset.id === state[key]);
    }
  }
  refresh();
}

$("download").addEventListener("click", () => {
  const { week, ok } = weekFromForm(readForm());
  if (!ok) return;

  const blob = new Blob([JSON.stringify(week, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFor(week);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  $("out-help").textContent =
    `Saved ${filenameFor(week)} to your Downloads folder. Copy it to the iPad, `
    + `then in the game press E and choose "Load a file".`;
});

$("open-week").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const week = JSON.parse(await file.text());
    if (!Array.isArray(week.rounds)) throw new Error("that file has no characters in it");
    loadWeekIntoForm(week);
    $("out-help").textContent = `Opened ${file.name}.`;
  } catch (error) {
    $("out-help").textContent = `Could not open that file: ${error.message}`;
  } finally {
    event.target.value = "";   // let the same file be picked twice
  }
});
```

Extend `refresh()` once more so the button reflects whether there is anything
to save — replace it with:

```js
function refresh() {
  const result = weekFromForm(readForm());
  renderReport(result);
  renderPreview(result.week);
  $("download").disabled = !result.ok;
  return result;
}
```

- [ ] **Step 3: Style the output panel**

```css
.panel-out { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.primary {
  all: unset; cursor: pointer; padding: 14px 22px; border-radius: 10px;
  background: #3b82f6; color: #fff; font-weight: 700;
}
.primary:disabled { background: #b8c2d4; cursor: default; }
.secondary {
  cursor: pointer; padding: 14px 20px; border-radius: 10px;
  border: 2px solid #dfe3ea; font-weight: 600;
}
@media (prefers-color-scheme: dark) { .secondary { border-color: #2b3140; } }
.panel-out .help { flex-basis: 100%; margin: 0; }
```

- [ ] **Step 4: Test the round trip**

Rebuild. Paste the week-one email, pick "plum" and "streamers" and "iris",
download the file. Reload the page, use *Open a week I made before* on that
file, and confirm every field comes back — including the palette outline and
both effect selections. Then open the downloaded file in a text editor and
confirm the `theme` block holds `plum`, `streamers` and `iris`.

Finally, load that same file into the live game at
https://stephengenusa.github.io/MariasBibleGame/ via `E` → *Load a file*, and
confirm the background and both effects actually changed.

- [ ] **Step 5: Commit**

```bash
git add src/builder dist/builder.html
git commit -m "Download a week file and reopen one for editing"
```

---

### Task 8: Deploy the builder

**Files:**
- Modify: `README.md` (create if absent)

- [ ] **Step 1: Write down the weekly routine**

Create or extend `README.md`:

```markdown
# Five Clues

A five-clue Bible character guessing game, run from an iPad and screen-shared
into Google Meet.

- **Play:** https://stephengenusa.github.io/MariasBibleGame/
- **Build a week:** https://stephengenusa.github.io/MariasBibleGame/builder.html

## Each week

1. Open the builder, paste the week's email, pick a background and two effects.
2. Download the week file.
3. Copy it to the iPad (USB drive, AirDrop, or iCloud Drive).
4. In the game, press `E` (or triple-tap the top-left corner) and choose
   *Load a file*.

Nothing needs rebuilding or redeploying to change the week's content.

## Changing the game itself

    python3 build.py
    node --test
    git add -A && git commit -m "..." && git push
    git subtree push --prefix dist origin gh-pages
```

- [ ] **Step 2: Deploy**

```bash
python3 build.py
node --test
git add -A && git commit -m "Add the week builder and document the weekly routine"
git push origin main
git subtree push --prefix dist origin gh-pages
```

- [ ] **Step 3: Verify it is live**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://stephengenusa.github.io/MariasBibleGame/builder.html
```

Expected: `200`. Then open it in a browser and download one week file end to end.

---

## Done when

- `node --test` passes every suite.
- The builder opens both by double-clicking `dist/builder.html` and from the
  Pages URL.
- Pasting the week-one email lists seven characters with no warnings.
- All eleven effects preview over the live stage.
- A downloaded week file loads into the real game and visibly changes the
  background and both effects.
- `README.md` states the weekly routine in steps a non-technical person can follow.
