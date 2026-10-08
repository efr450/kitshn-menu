// Local test loop for the phone page, so it can be tried without a Tandoor browser session:
// serves public/ at http://127.0.0.1:8099/shop/ and passes /api/ to Tandoor with an API token.
// The token stays in this process; the page gets only a placeholder CSRF cookie.
//   node dev-server.js --env <file with TANDOOR_URL and TANDOOR_TOKEN lines>
// (the Menu repo's importer/.env has both). Writes go to the real list.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8099;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const envFile = process.argv[process.argv.indexOf("--env") + 1];
const env = { ...process.env };
if (process.argv.includes("--env")) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
if (!env.TANDOOR_TOKEN) throw new Error("TANDOOR_TOKEN missing: pass --env <file>");
const tandoor = (env.TANDOOR_URL || "http://localhost").replace(/\/$/, "");

// Only what the page calls, so another site open in the browser can't use the token through this proxy
const ALLOWED = [
  ["GET", /^\/api\/(shopping-list-entry|unit|unit-conversion|food|supermarket-category)\/$/],
  ["POST", /^\/api\/(shopping-list-entry|shopping-list-entry\/bulk|food|supermarket-category|shopping-list-recipe)\/$/],
  ["PATCH", /^\/api\/shopping-list-entry\/\d+\/$/],
  ["DELETE", /^\/api\/(shopping-list-entry|shopping-list-recipe)\/\d+\/$/],
];
const HOST = `127.0.0.1:${PORT}`;
const CSRF = "dev";

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  // a DNS-rebound name or another origin's request doesn't come with our Host and CSRF header
  if (req.headers.host !== HOST) { res.writeHead(421).end(); return; }
  if (url.pathname.startsWith("/api/")) {
    if (!ALLOWED.some(([m, p]) => m === req.method && p.test(url.pathname))) { res.writeHead(403).end(); return; }
    if (req.method !== "GET" && req.headers["x-csrftoken"] !== CSRF) { res.writeHead(403).end(); return; }
    const body = req.method === "GET" || req.method === "DELETE" ? undefined : await new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
    const r = await fetch(tandoor + url.pathname + url.search, {
      method: req.method, body,
      headers: { Authorization: `Bearer ${env.TANDOOR_TOKEN}`, "Content-Type": req.headers["content-type"] || "application/json", Accept: "application/json" },
    }).catch(() => null);
    if (!r) { res.writeHead(502).end(); return; }
    res.writeHead(r.status, r.status === 204 ? {} : { "Content-Type": r.headers.get("content-type") || "application/json" }).end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  if (!url.pathname.startsWith("/shop/")) { res.writeHead(302, { Location: "/shop/" }).end(); return; }
  const rel = normalize(url.pathname.slice("/shop/".length) || "index.html").replace(/^(\.\.[/\\])+/, "");
  try {
    const file = readFileSync(join(ROOT, rel));
    res.writeHead(200, { "Content-Type": TYPES[extname(rel)] || "application/octet-stream", "Cache-Control": "no-cache",
      "Set-Cookie": `csrftoken=${CSRF}; Path=/; SameSite=Strict` }).end(file);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, "127.0.0.1", () => console.log(`phone page: http://127.0.0.1:${PORT}/shop/ -> ${tandoor}`));
