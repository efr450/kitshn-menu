import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { shellFiles, swVersion, writtenVersion } from "../sw-version.js";

test("the service worker caches every file the page loads", () => {
  for (const f of shellFiles()) assert.ok(existsSync(new URL(`../public/${f}`, import.meta.url)), f);
  // every module (a missing one breaks the page offline), less the service worker itself
  const modules = readdirSync(new URL("../public/", import.meta.url)).filter(f => f.endsWith(".js") && f !== "sw.js");
  for (const f of ["index.html", ...modules, "app.css", "manifest.json", "add/index.html", "add/add.js", "add/add.css"])
    assert.ok(shellFiles().includes(f), `${f} missing from SHELL in sw.js`);
});

test("the service worker's VERSION matches its files (run `npm run sw-version` after a change)", () => {
  assert.equal(writtenVersion(), swVersion());
});
