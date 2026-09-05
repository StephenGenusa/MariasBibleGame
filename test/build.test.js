import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

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
