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
