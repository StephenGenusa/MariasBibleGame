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

function safeLocalStorage() {
  // Merely touching localStorage can throw on iOS in some configurations.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = createStorage(safeLocalStorage());
const renderer = createRenderer(stage);
const engine = createEngine(canvas, stage);

let state = initialState(storage.getActiveWeek(EMBEDDED_WEEK));

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

// Show a real resolved screen with the chosen theme so an effect can be
// previewed at full size, then put the real state back.
function previewEffect(theme, outcome) {
  const round = state.week.rounds[0] ?? { answer: "Rebekah", clues: ["", "", "", "", ""] };
  const previewWeek = { rounds: [round], theme };

  let s = initialState(previewWeek);
  for (let i = 0; i < 5; i++) s = reduce(s, { type: "ADVANCE" });
  s = reduce(s, { type: outcome === "win" ? "WIN" : "FAIL" });

  applyTheme(previewWeek);
  renderer.render(viewModel(s));

  const preset = getPreset(outcome === "win" ? theme.winEffect : theme.loseEffect);
  engine.play(preset);
  return preset?.duration ?? 3000;
}

function endPreview() {
  engine.stop();
  applyTheme(state.week);
  renderer.render(viewModel(state));
}

function dispatch(action) {
  if (action.type === "EDIT") {
    if (state.phase === "TITLE" || state.phase === "END") {
      openEditor({
        storage,
        onLoad: loadWeek,
        embedded: EMBEDDED_WEEK,
        previewEffect,
        endPreview,
      });
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

// Offline support. Absent (harmlessly) when opened from a file:// URL.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Not fatal: the game runs perfectly well online.
    });
  });
}
