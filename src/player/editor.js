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

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function openEditor({ storage, onLoad, embedded }) {
  if (document.querySelector(".editor")) return;

  const panel = document.createElement("div");
  panel.className = "editor";
  panel.innerHTML = `
    <div class="editor-inner">
      <h2>Load a week</h2>
      <p class="editor-hint">Paste the week's list exactly as it arrived: the
        answer on its own line, a blank line, then the five clues.</p>
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
    const lines = rounds.map(r => `<li><b>${escapeHtml(r.answer)}</b> &mdash; ${r.clues.length} clues</li>`);
    const warned = warnings.map(w => `<li class="warn">${escapeHtml(w)}</li>`);
    say(`<ul>${lines.join("")}${warned.join("")}</ul>`);
    saveButton.disabled = rounds.length === 0;
  }

  function currentTheme() {
    return storage.getActiveWeek(embedded).theme ?? DEFAULT_THEME;
  }

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
    panel.remove();
  }

  panel.addEventListener("click", event => {
    const { act, use, del } = event.target.dataset;

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

  renderList();
  document.body.append(panel);
  textarea.focus();
}
