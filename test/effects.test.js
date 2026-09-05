import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeParticle, stepParticle,
  MIN_RADIUS, MAX_RADIUS, MAX_PARTICLES, MIN_DURATION, MAX_DURATION,
} from "../src/player/effects.js";

test("the compression budget is what the spec says", () => {
  assert.equal(MIN_RADIUS, 6);
  assert.equal(MAX_RADIUS, 14);
  assert.equal(MAX_PARTICLES, 250);
  assert.equal(MIN_DURATION, 2500);
  assert.equal(MAX_DURATION, 4000);
});

test("a particle gets sane defaults", () => {
  const p = makeParticle({ x: 10, y: 20 });
  assert.equal(p.x, 10);
  assert.equal(p.life, 1);
  assert.equal(p.shape, "circle");
  assert.equal(p.delay, 0);
});

test("gravity pulls a particle down over time", () => {
  const p = makeParticle({ y: 0, vy: 0, gravity: 0.3, drag: 1 });
  stepParticle(p, 1);
  assert.equal(p.vy, 0.3);
  assert.equal(p.y, 0.3);
});

test("drag slows horizontal motion", () => {
  const p = makeParticle({ vx: 10, drag: 0.5, gravity: 0 });
  stepParticle(p, 1);
  assert.equal(p.vx, 5);
});

test("life decays and can be driven to zero", () => {
  const p = makeParticle({ decay: 0.25 });
  for (let i = 0; i < 4; i++) stepParticle(p, 1);
  assert.ok(p.life <= 0, "particle should be spent");
});

test("the frame count scales displacement linearly", () => {
  const a = makeParticle({ x: 0, vx: 3, gravity: 0, drag: 1 });
  const b = makeParticle({ x: 0, vx: 3, gravity: 0, drag: 1 });
  stepParticle(a, 2);
  stepParticle(b, 1);
  assert.equal(a.x, 6);
  assert.equal(b.x, 3);
});

test("a long frame gap applies proportionally more gravity", () => {
  // This is Euler integration, so two half-steps do NOT equal one whole step.
  // What must hold is that a single step scales with the frame count.
  const p = makeParticle({ vy: 0, gravity: 0.5, drag: 1 });
  stepParticle(p, 3);
  assert.equal(p.vy, 1.5);
});

test("a delayed particle holds still and burns off its delay", () => {
  const p = makeParticle({ x: 0, vx: 5, delay: 2, gravity: 0, drag: 1 });
  stepParticle(p, 1);
  assert.equal(p.x, 0, "should not move while delayed");
  assert.equal(p.delay, 1);
  stepParticle(p, 1);
  assert.equal(p.x, 0);
  stepParticle(p, 1);
  assert.equal(p.x, 5, "should move once the delay is spent");
});

test("spin accumulates into rotation", () => {
  const p = makeParticle({ spin: 0.2, rotation: 0 });
  stepParticle(p, 3);
  assert.ok(Math.abs(p.rotation - 0.6) < 1e-9);
});
