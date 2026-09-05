import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";

test("build produces a self-contained player", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/index.html", "utf8");

  assert.ok(!/<!--INLINE:/.test(html), "an INLINE placeholder was left unreplaced");
  assert.ok(!/^\s*(import|export)\s/m.test(html), "module syntax survived inlining");
  assert.ok(!/(?:src|href)=["']https?:/.test(html), "the file references an external resource");
  assert.match(html, /id="game-data"/, "the embedded data block is missing");
});

test("the inlined bundle is valid JavaScript", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/index.html", "utf8");

  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, "no module script found in the built file");

  const bundle = match[1];
  const tmp = "dist/.bundle-check.mjs";
  writeFileSync(tmp, bundle);
  try {
    // node --check parses without executing: it catches anything the module
    // concatenation broke, which is the failure mode this build can actually have.
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } finally {
    rmSync(tmp, { force: true });
  }

  // Every module must have made it in, in dependency order.
  const order = ["parser.js", "machine.js", "storage.js", "effects.js",
                 "render.js", "input.js", "editor.js", "main.js"];
  let cursor = -1;
  for (const name of order) {
    const at = bundle.indexOf(`/* ---------- ${name} ---------- */`);
    assert.ok(at > cursor, `${name} is missing or out of dependency order`);
    cursor = at;
  }
});

test("build emits the install assets", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  assert.ok(existsSync("dist/sw.js"), "service worker missing");
  assert.ok(existsSync("dist/icon-180.png"), "home screen icon missing");
  assert.ok(statSync("dist/icon-180.png").size > 200, "icon looks empty");

  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
});

test("the service worker version changes when the page does", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const sw = readFileSync("dist/sw.js", "utf8");
  assert.match(sw, /const CACHE = "bible-clue-[0-9a-f]{8}"/,
    "the cache name must be content-derived so an update actually lands");
});
