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
