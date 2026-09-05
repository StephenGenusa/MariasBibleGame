import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("build produces a self-contained player", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const html = readFileSync("dist/index.html", "utf8");

  assert.ok(!/<!--INLINE:/.test(html), "an INLINE placeholder was left unreplaced");
  assert.ok(!/^\s*(import|export)\s/m.test(html), "module syntax survived inlining");
  assert.ok(!/(?:src|href)=["']https?:/.test(html), "the file references an external resource");
  assert.match(html, /id="game-data"/, "the embedded data block is missing");
});
