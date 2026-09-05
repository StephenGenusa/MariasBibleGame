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
