import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { shellFiles, swVersion, writtenVersion } from "../sw-version.js";

test("the service worker caches every file the page loads", () => {
  for (const f of shellFiles()) assert.ok(existsSync(new URL(`../public/${f}`, import.meta.url)), f);
  for (const f of ["index.html", "app.js", "api.js", "buy.js", "list.js", "sync.js", "snapshot.js", "parse.js", "foods.js", "edit.js", "actions.js", "app.css", "manifest.json"])
    assert.ok(shellFiles().includes(f), `${f} missing from SHELL in sw.js`);
});

test("the service worker's VERSION matches its files (run `npm run sw-version` after a change)", () => {
  assert.equal(writtenVersion(), swVersion());
});
