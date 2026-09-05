import { test } from "node:test";
import assert from "node:assert/strict";
import { keyToAction, createDebouncer, isTypingTarget, DEBOUNCE_MS } from "../src/player/input.js";

test("space and right arrow advance", () => {
  assert.equal(keyToAction(" "), "ADVANCE");
  assert.equal(keyToAction("ArrowRight"), "ADVANCE");
});

test("left arrow and backspace go back", () => {
  assert.equal(keyToAction("ArrowLeft"), "BACK");
  assert.equal(keyToAction("Backspace"), "BACK");
});

test("y and n resolve, in either case", () => {
  assert.equal(keyToAction("y"), "WIN");
  assert.equal(keyToAction("Y"), "WIN");
  assert.equal(keyToAction("n"), "FAIL");
  assert.equal(keyToAction("N"), "FAIL");
});

test("down arrow moves to the next round", () => {
  assert.equal(keyToAction("ArrowDown"), "NEXT_ROUND");
});

test("e opens the editor", () => {
  assert.equal(keyToAction("e"), "EDIT");
  assert.equal(keyToAction("E"), "EDIT");
});

test("Enter, PageUp and PageDown are deliberately dead keys", () => {
  // These were considered and rejected. Do not add them back.
  assert.equal(keyToAction("Enter"), null);
  assert.equal(keyToAction("PageUp"), null);
  assert.equal(keyToAction("PageDown"), null);
});

test("unmapped keys are ignored", () => {
  for (const key of ["a", "Escape", "Tab", "ArrowUp", "1", "", undefined]) {
    assert.equal(keyToAction(key), null, `${key} should be unmapped`);
  }
});

test("the debouncer blocks a second call inside the window", () => {
  const allow = createDebouncer(DEBOUNCE_MS);
  assert.equal(allow(1000), true);
  assert.equal(allow(1000 + DEBOUNCE_MS - 1), false);
});

test("the debouncer allows a call once the window has passed", () => {
  const allow = createDebouncer(DEBOUNCE_MS);
  assert.equal(allow(1000), true);
  assert.equal(allow(1000 + DEBOUNCE_MS), true);
  assert.equal(allow(1000 + DEBOUNCE_MS + 10), false);
});

test("the first call is always allowed", () => {
  assert.equal(createDebouncer(DEBOUNCE_MS)(0), true);
});

test("text fields are never treated as game input", () => {
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ isContentEditable: true }), true);
});

test("ordinary elements are game input", () => {
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(undefined), false);
});
