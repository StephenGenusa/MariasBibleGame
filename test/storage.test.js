import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage, MAX_WEEKS } from "../src/player/storage.js";

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

class DOMExceptionish extends Error {}
class ThrowingStorage {
  getItem() { throw new DOMExceptionish(); }
  setItem() { throw new DOMExceptionish(); }
  removeItem() { throw new DOMExceptionish(); }
}

const week = (id, answer = "Rebekah") => ({
  formatVersion: 1, id, title: id,
  theme: { background: "slate", backgroundImage: null, winEffect: "fireworks", loseEffect: "ashfall" },
  rounds: [{ answer, clues: ["a", "b", "c", "d", "e"] }],
});

const EMBEDDED = week("embedded", "Elijah");

test("with nothing stored, the embedded week is used", () => {
  const s = createStorage(new FakeStorage());
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("a saved week becomes the active one", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("2026-09-20"));
  assert.equal(s.getActiveWeek(EMBEDDED).id, "2026-09-20");
  assert.equal(s.loadWeeks().length, 1);
});

test("saving the same id replaces rather than duplicates", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("2026-09-20", "Old"));
  s.saveWeek(week("2026-09-20", "New"));
  const weeks = s.loadWeeks();
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].rounds[0].answer, "New");
});

test("the library is capped, dropping the oldest", () => {
  const s = createStorage(new FakeStorage());
  for (let i = 0; i < MAX_WEEKS + 3; i++) s.saveWeek(week(`w${i}`));
  const ids = s.loadWeeks().map(w => w.id);
  assert.equal(ids.length, MAX_WEEKS);
  assert.equal(ids[0], "w3", "the three oldest should have been dropped");
  assert.equal(ids.at(-1), `w${MAX_WEEKS + 2}`);
});

test("an explicit active id is honoured", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.saveWeek(week("b"));
  s.setActiveWeekId("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "a");
});

test("an active id pointing at a deleted week falls back to the newest", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.saveWeek(week("b"));
  s.setActiveWeekId("a");
  s.deleteWeek("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "b");
});

test("deleting the only week falls back to the embedded one", () => {
  const s = createStorage(new FakeStorage());
  s.saveWeek(week("a"));
  s.deleteWeek("a");
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("corrupt stored data is ignored rather than thrown", () => {
  const backing = new FakeStorage();
  backing.setItem("bibleClueGame.weeks", "{not json");
  const s = createStorage(backing);
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("stored data of the wrong shape is ignored", () => {
  const backing = new FakeStorage();
  backing.setItem("bibleClueGame.weeks", JSON.stringify([{ id: "x" }, 42, null]));
  const s = createStorage(backing);
  assert.deepEqual(s.loadWeeks(), [], "entries without rounds are not weeks");
});

test("a storage backend that throws never breaks the game", () => {
  const s = createStorage(new ThrowingStorage());
  assert.deepEqual(s.loadWeeks(), []);
  assert.doesNotThrow(() => s.saveWeek(week("a")));
  assert.doesNotThrow(() => s.setActiveWeekId("a"));
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});

test("a missing backing store is tolerated", () => {
  const s = createStorage(null);
  assert.deepEqual(s.loadWeeks(), []);
  assert.equal(s.getActiveWeek(EMBEDDED).id, "embedded");
});
