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
