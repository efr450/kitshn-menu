// Keeps the phone page's own files on the phone so it opens with no signal. Each version's files
// are cached together at install (all or nothing) and served from that cache, so a page never mixes
// old and new files. VERSION is a hash of the files: `npm run sw-version` updates it, and
// test/sw.test.js fails when it's stale. A changed VERSION makes phones fetch the new set; the next
// open shows it. Tandoor's /api/ requests pass straight through (sync.js keeps the list), and so do
// the recipe inbox's /shop/api/ ones. Menu fork: it also shows the inbox's push notifications.

const VERSION = "ee9064d79dd6";
const CACHE = `menu-shop-${VERSION}`;
const SHELL = ["/shop/", "/shop/app.css", "/shop/app.js", "/shop/api.js", "/shop/buy.js", "/shop/list.js",
  "/shop/sync.js", "/shop/queue.js", "/shop/parse.js", "/shop/foods.js", "/shop/edit.js", "/shop/actions.js", "/shop/foodset.js", "/shop/inbox.js", "/shop/add/", "/shop/add/add.js", "/shop/add/add.css",
  "/shop/manifest.json", "/shop/icon.svg", "/shop/icon-192.png", "/shop/icon-512.png"];

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
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/shop/") || url.pathname.startsWith("/shop/api/")) return;
  // a page opens from its own cached copy whatever its query (?job=, a shared ?url=)
  const key = e.request.mode === "navigate" ? (url.pathname.startsWith("/shop/add") ? "/shop/add/" : "/shop/") : url.pathname;
  e.respondWith(caches.open(CACHE).then(c => c.match(key)).then(hit => hit || fetch(e.request)));
});

// The recipe inbox (add/) asks for these when a recipe needs someone or is added: {title, body, url, tag}.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Menu", {
    body: d.body || "", tag: d.tag, data: { url: d.url || "/shop/add/" }, icon: "/shop/icon-192.png", badge: "/shop/icon-192.png",
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/shop/add/", location.origin);
  if (url.origin !== location.origin) return;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (!new URL(c.url).pathname.startsWith("/shop/add")) continue;
      try { await c.navigate(url.href); return c.focus(); } catch { break; } // an uncontrolled page can't be navigated
    }
    return self.clients.openWindow(url.href);
  })());
});
