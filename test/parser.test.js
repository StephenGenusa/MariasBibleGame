import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWeekText } from "../src/player/parser.js";

const SAMPLE = [
  "Rules: Slowly reveal five clues about a Bible character. Once you think you have the",
  "character, call out your name and lock in your answer.",
  " ",
  "By Clue 1--five points",
  "By Clue 2--four points",
  " ",
  " ",
  "Rebekah",
  " ",
  "An answer to prayer",
  "Animal lover",
  "Stay hydrated",
  "Born when their spouse almost died",
  "Eavesdropper",
  " ",
  "Elijah",
  " ",
  "Appeared out of nowhere",
  "Wanted to die under a plant",
  "Listen to me",
  "DoorDash",
  "450 vs 1",
  "",
].join("\n");

test("parses the supplied sample into rounds", () => {
  const { rounds, warnings } = parseWeekText(SAMPLE);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].answer, "Rebekah");
  assert.deepEqual(rounds[0].clues, [
    "An answer to prayer",
    "Animal lover",
    "Stay hydrated",
    "Born when their spouse almost died",
    "Eavesdropper",
  ]);
  assert.equal(rounds[1].answer, "Elijah");
  assert.equal(rounds[1].clues.at(-1), "450 vs 1");
  assert.deepEqual(warnings, []);
});

test("drops the rules preamble and the scoring table", () => {
  const { rounds } = parseWeekText(SAMPLE);
  assert.ok(!rounds.some(r => /^Rules/i.test(r.answer)), "rules block became a round");
  assert.ok(!rounds.some(r => /points/i.test(r.answer)), "scoring block became a round");
});

test("warns about the wrong number of clues but keeps the round", () => {
  const { rounds, warnings } = parseWeekText("Achan\n\nTribe of Judah\nConfessed");
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].clues.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Achan/);
  assert.match(warnings[0], /2 clues/);
});

test("warns about a duplicate answer", () => {
  const text = "Tamar\n\na\nb\nc\nd\ne\n\nTamar\n\nf\ng\nh\ni\nj";
  const { rounds, warnings } = parseWeekText(text);
  assert.equal(rounds.length, 2);
  assert.equal(warnings.filter(w => /more than once/.test(w)).length, 1);
});

test("skips a block that has an answer but no clues", () => {
  const { rounds, warnings } = parseWeekText("Lonely\n\nUriah\n\na\nb\nc\nd\ne");
  assert.deepEqual(rounds.map(r => r.answer), ["Uriah"]);
  assert.match(warnings.find(w => /Lonely/.test(w)), /no clues/);
});

test("warns when nothing at all parses", () => {
  const { rounds, warnings } = parseWeekText("   \n \n");
  assert.deepEqual(rounds, []);
  assert.match(warnings[0], /No rounds/);
});

test("tolerates CRLF, tabs and a null input", () => {
  const { rounds } = parseWeekText("Samuel\r\n\r\n\tAn answer to prayer\r\nDivided household");
  assert.equal(rounds[0].answer, "Samuel");
  assert.equal(rounds[0].clues[0], "An answer to prayer");
  assert.deepEqual(parseWeekText(null).rounds, []);
});
