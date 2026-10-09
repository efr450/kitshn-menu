// Keeps the phone page's own files on the phone so it opens with no signal. Each version's files
// are cached together at install (all or nothing) and served from that cache, so a page never mixes
// old and new files. VERSION is a hash of the files: `npm run sw-version` updates it, and
// test/sw.test.js fails when it's stale. A changed VERSION makes phones fetch the new set; the next
// open shows it. Tandoor's /api/ requests pass straight through (sync.js keeps the list).

const VERSION = "dcec8b1d8286";
const CACHE = `menu-shop-${VERSION}`;
const SHELL = ["/shop/", "/shop/app.css", "/shop/app.js", "/shop/api.js", "/shop/buy.js", "/shop/list.js",
  "/shop/sync.js", "/shop/snapshot.js", "/shop/parse.js", "/shop/foods.js", "/shop/edit.js", "/shop/actions.js", "/shop/manifest.json", "/shop/icon.svg", "/shop/icon-192.png", "/shop/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("menu-shop") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/shop/")) return;
  const key = e.request.mode === "navigate" ? "/shop/" : url.pathname;
  e.respondWith(caches.open(CACHE).then(c => c.match(key)).then(hit => hit || fetch(e.request)));
});
