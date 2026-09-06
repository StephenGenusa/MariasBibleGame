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

  for (const size of [180, 192, 512]) {
    assert.ok(existsSync(`dist/icon-${size}.png`), `icon-${size}.png missing`);
    assert.ok(statSync(`dist/icon-${size}.png`).size > 200, `icon-${size}.png looks empty`);
  }

  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /rel="manifest"/);
});

test("the manifest describes an installable standalone app", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));

  assert.equal(manifest.display, "standalone", "an installed app must lose browser chrome");
  // Relative, so the app keeps working under the /MariasBibleGame/ project path.
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some(i => i.sizes === "192x192"), "192px icon missing");
  assert.ok(manifest.icons.some(i => i.sizes === "512x512"), "512px icon missing");

  const sw = readFileSync("dist/sw.js", "utf8");
  for (const asset of ["./index.html", "./manifest.webmanifest", "./icon-512.png"]) {
    assert.ok(sw.includes(`"${asset}"`), `${asset} is not precached`);
  }
});

test("the service worker serves from cache first", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const sw = readFileSync("dist/sw.js", "utf8");

  // The whole point of installing the app: it opens with no network at all.
  // A network-first worker stalls on a bad connection, which is exactly the
  // situation the moderator is in when a meeting is already running.
  const handler = sw.slice(sw.indexOf('addEventListener("fetch"'));
  assert.ok(handler.indexOf("caches.match") < handler.indexOf("fetch(event.request)"),
    "the fetch handler must consult the cache before the network");
  assert.match(handler, /return hit \|\| network/,
    "a cache hit must be served without waiting on the network");
});

test("the service worker version changes when the page does", () => {
  execFileSync("python3", ["build.py"], { stdio: "pipe" });
  const sw = readFileSync("dist/sw.js", "utf8");
  assert.match(sw, /const CACHE = "bible-clue-[0-9a-f]{8}"/,
    "the cache name must be content-derived so an update actually lands");
});

test("the hidden attribute beats the layout rules that fight it", () => {
  // Several overlays set `display: flex`, which overrides the UA stylesheet's
  // `[hidden] { display: none }`. Without an explicit override every screen
  // renders at once and the last one in the DOM covers the game.
  const css = readFileSync("src/player/style.css", "utf8");
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
    "style.css must force [hidden] to display:none");

  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
    "the override must survive into the built file");
});
