// Set up a week without rebuilding: name it, paste it, choose how it looks,
// and save, export or load it.

import { parseWeekText } from "./parser.js";
import { initialState, reduce } from "./machine.js";
import { BACKGROUNDS, viewModel, createRenderer } from "./render.js";
import { WIN_PRESETS, LOSE_PRESETS } from "./effects.js";

const DEFAULT_THEME = {
  background: "slate",
  backgroundImage: null,
  winEffect: "fireworks",
  loseEffect: "ashfall",
};

const WIN_IDS = WIN_PRESETS.map(p => p.id);
const LOSE_IDS = LOSE_PRESETS.map(p => p.id);

const SAMPLE_ROUND = {
  answer: "Rebekah",
  clues: ["An answer to prayer", "Animal lover", "Stay hydrated",
          "Born when their spouse almost died", "Eavesdropper"],
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

// The storage key comes from the typed name, so re-saving under the same name
// updates that week instead of leaving a near-duplicate behind.
export function slugifyName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function weekFromEditor({ text, name, background, winEffect, loseEffect }) {
  const { rounds, warnings } = parseWeekText(text);
  const slug = slugifyName(name);
  const id = slug || nextSundayId();

  const week = buildWeek({
    rounds,
    id,
    title: slug ? name.trim() : id,
    theme: {
      background: oneOf(background, BACKGROUNDS, DEFAULT_THEME.background),
      backgroundImage: null,
      // Checked against separate lists so neither picker can borrow the
      // other's presets.
      winEffect: oneOf(winEffect, WIN_IDS, DEFAULT_THEME.winEffect),
      loseEffect: oneOf(loseEffect, LOSE_IDS, DEFAULT_THEME.loseEffect),
    },
  });

  return { week, warnings, ok: rounds.length > 0 };
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const STAGE_MARKUP = `
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
  <section class="screen screen-end" hidden></section>`;

export function openEditor({ storage, onLoad, embedded, previewEffect, endPreview }) {
  if (document.querySelector(".editor")) return;

  const startingTheme = { ...DEFAULT_THEME, ...(storage.getActiveWeek(embedded).theme ?? {}) };
  const choice = {
    background: startingTheme.background,
    winEffect: startingTheme.winEffect,
    loseEffect: startingTheme.loseEffect,
  };

  const panel = document.createElement("div");
  panel.className = "editor";
  panel.innerHTML = `
    <div class="editor-inner">
      <h2>Set up a week</h2>

      <label class="ed-field">
        <span class="ed-label">Name this week</span>
        <input type="text" class="ed-name" autocomplete="off" spellcheck="false"
               placeholder="${escapeHtml(nextSundayId())}">
        <span class="editor-hint">Saving again under the same name replaces that week.</span>
      </label>

      <h3>The list</h3>
      <p class="editor-hint">Paste the week's list exactly as it arrived: the
        answer on its own line, a blank line, then the five clues.</p>
      <textarea class="editor-text" rows="10" spellcheck="false"
        placeholder="Rebekah&#10;&#10;An answer to prayer&#10;Animal lover&#10;Stay hydrated&#10;Born when their spouse almost died&#10;Eavesdropper"></textarea>
      <div class="editor-report" role="status"></div>

      <h3>Background</h3>
      <div class="ed-palette"></div>

      <h3>Preview</h3>
      <div class="ed-frame"><div class="stage ed-stage">${STAGE_MARKUP}</div></div>

      <h3>When someone gets it right</h3>
      <div class="ed-effects" data-kind="win"></div>

      <h3>When nobody gets it</h3>
      <div class="ed-effects" data-kind="lose"></div>

      <div class="editor-row">
        <button type="button" class="editor-btn ed-primary" data-act="save" disabled>Use this week</button>
        <button type="button" class="editor-btn" data-act="export" disabled>Export file</button>
        <label class="editor-btn">Load a file<input type="file" accept="application/json,.json" hidden></label>
        <button type="button" class="editor-btn" data-act="close">Close</button>
      </div>
      <div class="editor-note" role="status"></div>

      <h3>Saved weeks</h3>
      <ul class="editor-weeks"></ul>
    </div>`;

  const $ = sel => panel.querySelector(sel);
  const nameInput = $(".ed-name");
  const textarea = $(".editor-text");
  const report = $(".editor-report");
  const note = $(".editor-note");
  const paletteEl = $(".ed-palette");
  const previewStage = $(".ed-stage");
  const fileInput = $('input[type="file"]');
  const list = $(".editor-weeks");
  const saveButton = $('[data-act="save"]');
  const exportButton = $('[data-act="export"]');

  const previewRenderer = createRenderer(previewStage);

  function readForm() {
    return {
      text: textarea.value,
      name: nameInput.value,
      background: choice.background,
      winEffect: choice.winEffect,
      loseEffect: choice.loseEffect,
    };
  }

  function renderReport({ week, warnings, ok }) {
    if (!ok) {
      report.innerHTML = `<p class="editor-hint">Nothing recognised yet. Paste the
        list above &mdash; answer, blank line, five clues.</p>`;
      return;
    }
    const rounds = week.rounds.map(r =>
      `<li><b>${escapeHtml(r.answer)}</b><span class="ed-count${r.clues.length === 5 ? "" : " off"}">${r.clues.length} clues</span></li>`).join("");
    const notes = warnings.map(w => `<li class="warn">${escapeHtml(w)}</li>`).join("");
    report.innerHTML =
      `<p class="ed-good">${week.rounds.length} found.</p>
       <ul class="ed-rounds">${rounds}</ul>
       ${notes ? `<ul class="ed-rounds">${notes}</ul>` : ""}`;
  }

  function renderPreview(week) {
    previewStage.dataset.bg = week.theme.background;
    const sample = { rounds: [week.rounds[0] ?? SAMPLE_ROUND], theme: week.theme };
    let s = initialState(sample);
    for (let i = 0; i < 3; i++) s = reduce(s, { type: "ADVANCE" });
    previewRenderer.render(viewModel(s));
  }

  function refresh() {
    const result = weekFromEditor(readForm());
    renderReport(result);
    renderPreview(result.week);
    saveButton.disabled = !result.ok;
    exportButton.disabled = !result.ok;
    return result;
  }

  /* ---- background palette ---- */

  paletteEl.innerHTML = BACKGROUNDS.map(id =>
    `<button type="button" class="ed-swatch stage" data-bg="${id}" data-pick-bg="${id}"
             aria-label="${id}"><span>Aa</span></button>`).join("");

  function markPalette() {
    for (const el of paletteEl.querySelectorAll(".ed-swatch")) {
      el.classList.toggle("is-on", el.dataset.pickBg === choice.background);
    }
  }

  /* ---- effect pickers ---- */

  function mountEffects(kind, presets) {
    const host = panel.querySelector(`.ed-effects[data-kind="${kind}"]`);
    host.innerHTML = presets.map(p =>
      `<div class="ed-effect" data-id="${p.id}">
         <button type="button" class="ed-effect-pick" data-pick-fx="${p.id}" data-kind="${kind}">${escapeHtml(p.label)}</button>
         <button type="button" class="ed-effect-play" data-play-fx="${p.id}" data-kind="${kind}" aria-label="Preview ${escapeHtml(p.label)}">&#9654;</button>
       </div>`).join("");
  }
  mountEffects("win", WIN_PRESETS);
  mountEffects("lose", LOSE_PRESETS);

  function markEffects() {
    for (const kind of ["win", "lose"]) {
      const selected = kind === "win" ? choice.winEffect : choice.loseEffect;
      for (const node of panel.querySelectorAll(`.ed-effects[data-kind="${kind}"] .ed-effect`)) {
        node.classList.toggle("is-on", node.dataset.id === selected);
      }
    }
  }

  // Step the whole panel aside so the effect plays at full size on the real
  // stage. A shrunken effect says nothing about how it survives compression.
  let previewTimer = null;
  function playFullScreen(id, kind) {
    if (previewTimer) return;
    const theme = { ...DEFAULT_THEME, background: choice.background };
    if (kind === "win") theme.winEffect = id; else theme.loseEffect = id;

    panel.classList.add("is-away");
    const ms = previewEffect(theme, kind === "win" ? "win" : "fail");

    function finish() {
      if (!previewTimer) return;
      clearTimeout(previewTimer);
      previewTimer = null;
      document.removeEventListener("pointerdown", finish, true);
      panel.classList.remove("is-away");
      endPreview();
    }

    // The panel's own fade costs time, and several presets build slowly, so
    // hold well past the stated duration. A tap ends it early.
    previewTimer = setTimeout(finish, ms + 1400);
    setTimeout(() => document.addEventListener("pointerdown", finish, true), 400);
  }

  /* ---- saved weeks ---- */

  function renderList() {
    const weeks = storage.loadWeeks();
    list.innerHTML = weeks.length
      ? weeks.map(w =>
          `<li><button type="button" data-use="${escapeHtml(w.id)}">${escapeHtml(w.title)}</button>
           <button type="button" class="del" data-del="${escapeHtml(w.id)}" aria-label="Delete">&times;</button></li>`
        ).reverse().join("")
      : '<li class="editor-hint">Nothing saved yet &mdash; the built-in week is in use.</li>';
  }

  function close() {
    clearTimeout(previewTimer);
    previewTimer = null;
    panel.remove();
  }

  function download(week) {
    const blob = new Blob([JSON.stringify(week, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugifyName(week.title) || "week"}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note.textContent = `Saved ${link.download}. Keep it somewhere safe — it is your backup.`;
  }

  function loadIntoForm(week) {
    textarea.value = week.rounds
      .map(r => [r.answer, "", ...r.clues].join("\n"))
      .join("\n\n");
    nameInput.value = week.title ?? week.id ?? "";
    const theme = { ...DEFAULT_THEME, ...(week.theme ?? {}) };
    choice.background = oneOf(theme.background, BACKGROUNDS, DEFAULT_THEME.background);
    choice.winEffect = oneOf(theme.winEffect, WIN_IDS, DEFAULT_THEME.winEffect);
    choice.loseEffect = oneOf(theme.loseEffect, LOSE_IDS, DEFAULT_THEME.loseEffect);
    markPalette();
    markEffects();
    refresh();
  }

  panel.addEventListener("click", event => {
    const el = event.target;
    const bg = el.closest("[data-pick-bg]");
    const pickFx = el.closest("[data-pick-fx]");
    const playFx = el.closest("[data-play-fx]");
    const act = el.closest("[data-act]")?.dataset.act;
    const use = el.closest("[data-use]")?.dataset.use;
    const del = el.closest("[data-del]")?.dataset.del;

    if (bg) {
      choice.background = bg.dataset.pickBg;
      markPalette();
      refresh();
    } else if (pickFx) {
      const kind = pickFx.dataset.kind;
      if (kind === "win") choice.winEffect = pickFx.dataset.pickFx;
      else choice.loseEffect = pickFx.dataset.pickFx;
      markEffects();
      refresh();
      playFullScreen(pickFx.dataset.pickFx, kind);
    } else if (playFx) {
      playFullScreen(playFx.dataset.playFx, playFx.dataset.kind);
    } else if (act === "save") {
      const { week, ok } = refresh();
      if (!ok) return;
      storage.saveWeek(week);
      close();
      onLoad(week);
    } else if (act === "export") {
      const { week, ok } = refresh();
      if (ok) download(week);
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
      loadIntoForm(week);
      note.textContent = `Opened ${file.name}. Press "Use this week" to play it.`;
    } catch (error) {
      note.innerHTML = `<span class="warn">Could not read that file: ${escapeHtml(error.message)}</span>`;
    } finally {
      fileInput.value = "";
    }
  });

  textarea.addEventListener("input", refresh);
  nameInput.addEventListener("input", refresh);

  markPalette();
  markEffects();
  renderList();
  document.body.append(panel);
  refresh();
  nameInput.focus();
}
