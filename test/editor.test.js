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

import { slugifyName, weekFromEditor } from "../src/player/editor.js";

const TEXT = [
  "Rebekah", "", "An answer to prayer", "Animal lover", "Stay hydrated",
  "Born when their spouse almost died", "Eavesdropper", "",
  "The Ark", "", "a", "b", "c", "d", "e",
].join("\n");

const FORM = {
  text: TEXT,
  name: "Sept 13",
  background: "plum",
  winEffect: "streamers",
  loseEffect: "iris",
};

test("a typed name becomes a stable storage key", () => {
  assert.equal(slugifyName("Sept 13"), "sept-13");
  assert.equal(slugifyName("  Week of the 20th!  "), "week-of-the-20th");
  assert.equal(slugifyName("Lot's Wife & Friends"), "lot-s-wife-friends");
});

test("the same name always yields the same key, so re-saving updates", () => {
  assert.equal(slugifyName("Sept 13"), slugifyName("sept 13"));
  assert.equal(slugifyName("Sept 13"), slugifyName("Sept  13 "));
});

test("a name with nothing usable in it yields an empty key", () => {
  assert.equal(slugifyName("!!!"), "");
  assert.equal(slugifyName("   "), "");
  assert.equal(slugifyName(null), "");
});

test("builds a complete week from the editor form", () => {
  const { week, ok, warnings } = weekFromEditor(FORM);
  assert.equal(ok, true);
  assert.deepEqual(warnings, []);
  assert.equal(week.formatVersion, 1);
  assert.equal(week.id, "sept-13");
  assert.equal(week.title, "Sept 13", "the typed name is what gets displayed");
  assert.equal(week.rounds.length, 2);
  assert.equal(week.rounds[1].answer, "The Ark", "topics work, not just people");
  assert.equal(week.theme.background, "plum");
  assert.equal(week.theme.winEffect, "streamers");
  assert.equal(week.theme.loseEffect, "iris");
});

test("a blank name falls back to the next Sunday", () => {
  const { week } = weekFromEditor({ ...FORM, name: "" });
  assert.match(week.id, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(week.title, week.id);
});

test("an unknown background falls back to slate", () => {
  const { week } = weekFromEditor({ ...FORM, background: "chartreuse" });
  assert.equal(week.theme.background, "slate");
});

test("a fail effect cannot be selected as a win effect", () => {
  // Grey flakes for a correct answer would be a bad surprise mid-meeting.
  const { week } = weekFromEditor({ ...FORM, winEffect: "ashfall" });
  assert.equal(week.theme.winEffect, "fireworks");
});

test("a win effect cannot be selected as a fail effect", () => {
  const { week } = weekFromEditor({ ...FORM, loseEffect: "fireworks" });
  assert.equal(week.theme.loseEffect, "ashfall");
});

test("empty text is not ok but still yields a usable object", () => {
  const { week, ok, warnings } = weekFromEditor({ ...FORM, text: "  \n " });
  assert.equal(ok, false);
  assert.deepEqual(week.rounds, []);
  assert.ok(warnings.length > 0);
});

test("parser warnings pass straight through", () => {
  const { warnings, ok } = weekFromEditor({ ...FORM, text: "Achan\n\nTribe of Judah\nConfessed" });
  assert.equal(ok, true);
  assert.match(warnings[0], /2 clues/);
});
