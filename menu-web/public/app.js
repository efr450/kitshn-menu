// The phone shopping page: wires ShopSync (sync.js) to the screen. Rules live in buy.js, list.js,
// sync.js and snapshot.js, which the tests cover; this file only draws and listens.

import { tandoorApi } from "./api.js";
import { shoppingAisles } from "./list.js";
import { snapshotFileName, snapshotHtml } from "./snapshot.js";
import { ShopSync, syncLabel } from "./sync.js";

const POLL_MS = 10_000;               // refresh while the page is open
const PACKAGES_MS = 10 * 60_000;      // package sizes change rarely
const LIST_KEY = "menu-shop-list";    // the last list: big, and only a convenience
const TICKS_KEY = "menu-shop-ticks";  // unsent ticks: small, kept apart so a big list can't crowd them out

// save() answers whether the ticks were kept; ShopSync warns when they weren't
const store = {
  load() {
    try {
      const list = JSON.parse(localStorage.getItem(LIST_KEY)) || {};
      return { ...list, pending: JSON.parse(localStorage.getItem(TICKS_KEY)) || [] };
    } catch { return null; }
  },
  save({ pending, ...list }) {
    try { localStorage.setItem(TICKS_KEY, JSON.stringify(pending)); } catch { return false; }
    try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* the list is refetched */ }
    return true;
  },
};

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const when = ms => new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const sync = new ShopSync({ api: tandoorApi(), store, onChange: draw });
let packagesAt = 0;
let drawn = "";

function noteFor() {
  if (sync.problem === "signin") return ["Tandoor needs you to sign in again. ", Object.assign(el("a", null, "Sign in"), { href: "/accounts/login/?next=/shop/" })];
  if (sync.problem === "dropped") return ["Tandoor wouldn't take some ticks, so they were undone. Tick them again."];
  if (!sync.stored) return ["This phone isn't keeping ticks, so ticks made offline are lost if you close the page."];
  if (sync.problem && sync.savedAt) return [`Showing the list saved ${when(sync.savedAt)}.`];
  return null;
}

function draw() {
  const aisles = shoppingAisles(sync.view(), sync.packages);
  const left = aisles.reduce((s, a) => s + a.left, 0);
  const pill = syncLabel({ problem: sync.problem, sending: sync.sending, waiting: sync.waiting(), left, fresh: sync.fresh });
  const unsent = new Set(sync.unsent());
  const note = noteFor();

  // redraw only when something on screen changes: a rebuild mid-tap would swallow the tap
  const key = JSON.stringify([aisles, pill, [...unsent], note?.map(n => typeof n === "string" ? n : n.href), sync.savedAt !== null]);
  if (key === drawn) return;
  drawn = key;

  $("pill").textContent = pill.text;
  $("pill").className = "pill" + (pill.tone === "ok" ? "" : " " + pill.tone);
  $("note").hidden = !note;
  if (note) $("note").replaceChildren(...note);

  const kids = [];
  for (const a of aisles) {
    const head = el("div", "aisle");
    head.append(el("span", null, a.name), el("span", null, `${a.left} left`));
    kids.push(head);
    for (const r of a.rows) {
      const row = el("button", "row" + (r.done ? " done" : "") + (r.ids.some(id => unsent.has(id)) ? " queued" : ""));
      row.type = "button";
      row.setAttribute("role", "checkbox");
      row.setAttribute("aria-checked", String(r.done));
      row.append(el("span", "box", r.done ? "✓" : ""), el("span", "food", r.name), el("span", "buy" + (r.buy ? "" : " plain"), r.buy || r.amounts));
      if (r.buy) row.append(el("span", "sub", `${r.amounts} in recipes`));
      row.addEventListener("click", () => sync.set(r.ids, !r.done));
      kids.push(row);
    }
  }
  if (!kids.length) kids.push(el("p", "empty", sync.savedAt ? "Nothing on the list." : sync.problem ? "No saved list on this phone yet." : "Loading the list…"));
  $("list").replaceChildren(...kids);
}

// one update at a time: polls, taps on the pill and coming back online all share it
let running = null;
function update({ force = false } = {}) {
  running ??= (async () => {
    await sync.flush();
    const packages = force || Date.now() - packagesAt > PACKAGES_MS;
    if (await sync.refresh({ packages })) packagesAt = Date.now();
    if (sync.waiting()) await sync.flush();
  })().finally(() => { running = null; });
  return running;
}

function saveCopy() {
  const html = snapshotHtml(shoppingAisles(sync.view(), sync.packages), sync.savedAt || Date.now());
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([html], { type: "text/html" })),
    download: snapshotFileName(sync.savedAt || Date.now()),
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function toggleMenu(open = $("menu").hidden) {
  $("menu").hidden = !open;
  $("more").setAttribute("aria-expanded", String(open));
}

$("more").addEventListener("click", () => toggleMenu());
$("save").addEventListener("click", () => { toggleMenu(false); saveCopy(); });
$("refresh").addEventListener("click", () => { toggleMenu(false); update({ force: true }); });
$("pill").addEventListener("click", () => update({ force: true }));
document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest("#menu, #more")) toggleMenu(false); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") update(); });
addEventListener("online", () => update());
setInterval(() => { if (document.visibilityState === "visible") update(); }, POLL_MS);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/shop/sw.js", { scope: "/shop/", updateViaCache: "none" }).catch(() => {});

sync.load();
draw();
update({ force: true });
