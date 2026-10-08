// The service worker's VERSION: a hash of the files it caches (its SHELL list), so a change to any
// of them needs a new VERSION. `node sw-version.js` prints it; `--write` puts it into public/sw.js.
// test/sw.test.js uses swVersion() to check sw.js is current.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SW = fileURLToPath(new URL("./public/sw.js", import.meta.url));

export function shellFiles(swSource = readFileSync(SW, "utf8")) {
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(swSource)[1];
  return [...list.matchAll(/"\/shop\/([^"]*)"/g)].map(m => m[1] || "index.html");
}

export function swVersion() {
  const h = createHash("sha256");
  for (const f of shellFiles()) h.update(f).update(readFileSync(new URL(`./public/${f}`, import.meta.url)));
  return h.digest("hex").slice(0, 12);
}

export const writtenVersion = (swSource = readFileSync(SW, "utf8")) => /const VERSION = "([^"]*)";/.exec(swSource)[1];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = swVersion();
  if (process.argv.includes("--write")) {
    const src = readFileSync(SW, "utf8");
    writeFileSync(SW, src.replace(/const VERSION = "[^"]*";/, `const VERSION = "${v}";`));
  }
  console.log(v);
}
