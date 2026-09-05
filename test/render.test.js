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
