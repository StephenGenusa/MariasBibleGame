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
  assert.equal(MAX_DURATION, 7000);
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

import {
  WIN_PRESETS, LOSE_PRESETS, PRESETS_BY_ID, getPreset,
} from "../src/player/effects.js";

const VIEWPORT = { width: 1280, height: 720 };
const ALL = () => [...WIN_PRESETS, ...LOSE_PRESETS];

test("there are six win presets and five lose presets", () => {
  assert.equal(WIN_PRESETS.length, 6);
  assert.equal(LOSE_PRESETS.length, 5);
  assert.deepEqual(
    WIN_PRESETS.map(p => p.id),
    ["fireworks", "cannons", "starburst", "goldenrain", "shockwave", "streamers"]);
  assert.deepEqual(
    LOSE_PRESETS.map(p => p.id),
    ["ashfall", "deflate", "shatter", "iris", "downpour"]);
});

test("every preset is uniquely identified and labelled", () => {
  const ids = ALL().map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of ALL()) {
    assert.equal(typeof p.label, "string");
    assert.ok(p.label.length > 0, `${p.id} has no label`);
    assert.equal(getPreset(p.id), p);
    assert.equal(PRESETS_BY_ID[p.id], p);
  }
});

test("an unknown id resolves to null", () => {
  assert.equal(getPreset("nope"), null);
  assert.equal(getPreset(undefined), null);
});

test("every preset declares the right kind", () => {
  for (const p of WIN_PRESETS) assert.equal(p.kind, "win", `${p.id}`);
  for (const p of LOSE_PRESETS) assert.equal(p.kind, "lose", `${p.id}`);
});

test("every duration is inside the spec's window", () => {
  for (const p of ALL()) {
    assert.ok(p.duration >= MIN_DURATION && p.duration <= MAX_DURATION,
      `${p.id} duration ${p.duration} is outside ${MIN_DURATION}-${MAX_DURATION}`);
  }
});

test("no preset exceeds the particle budget", () => {
  for (const p of ALL()) {
    const n = p.emit(VIEWPORT).length;
    assert.ok(n <= MAX_PARTICLES, `${p.id} emitted ${n}, over the ${MAX_PARTICLES} cap`);
  }
});

test("every emitted particle respects the radius bounds", () => {
  for (const p of ALL()) {
    for (const particle of p.emit(VIEWPORT)) {
      assert.ok(particle.r >= MIN_RADIUS && particle.r <= MAX_RADIUS,
        `${p.id} emitted r=${particle.r}, outside ${MIN_RADIUS}-${MAX_RADIUS}`);
    }
  }
});

test("every emitted particle starts alive, coloured and on-canvas horizontally", () => {
  for (const p of ALL()) {
    for (const particle of p.emit(VIEWPORT)) {
      assert.ok(particle.life > 0, `${p.id} emitted a dead particle`);
      assert.match(particle.color, /^#[0-9a-f]{6}$/i, `${p.id} has a bad colour`);
      assert.ok(particle.x >= -VIEWPORT.width && particle.x <= VIEWPORT.width * 2,
        `${p.id} emitted far off-canvas`);
    }
  }
});

test("the two screen-treatment presets use an overlay and no particles", () => {
  for (const id of ["deflate", "iris"]) {
    const p = getPreset(id);
    assert.equal(p.emit(VIEWPORT).length, 0, `${id} should emit nothing`);
    assert.equal(typeof p.overlay, "string", `${id} needs an overlay class`);
  }
});

test("particle presets declare no overlay", () => {
  for (const p of ALL()) {
    if (p.id === "deflate" || p.id === "iris") continue;
    assert.equal(p.overlay, null, `${p.id} should not set an overlay`);
    assert.ok(p.emit(VIEWPORT).length > 0, `${p.id} emitted nothing`);
  }
});

test("emission scales with the viewport rather than assuming a size", () => {
  const wide = getPreset("downpour").emit({ width: 2560, height: 1440 });
  assert.ok(wide.every(p => p.x <= 2560 * 1.2), "particles should stay near the viewport");
});

test("ashfall lingers long enough to be read, not just glimpsed", () => {
  const p = getPreset("ashfall");
  assert.ok(p.duration >= 5000, `ashfall runs for only ${p.duration}ms`);

  // Life must outlast the duration, or the flurries vanish mid-effect.
  const slowest = Math.max(...p.emit(VIEWPORT).map(q => q.decay));
  const framesAlive = 1 / slowest;
  assert.ok(framesAlive * (1000 / 60) >= p.duration,
    "particles decay before the effect is over");
});
