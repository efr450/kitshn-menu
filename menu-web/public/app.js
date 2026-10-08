// The phone shopping page: wires ShopSync (sync.js) to the screen. Rules live in buy.js, list.js,
// sync.js, snapshot.js, parse.js, foods.js, edit.js and actions.js, which the tests cover; this file
// only draws and listens.

import { addItem, setRowAmount } from "./actions.js";
import { tandoorApi } from "./api.js";
import { plan } from "./edit.js";
import { aisleOrder, exactFood, foodIndex, proposeFood, stillTyping, suggestFoods } from "./foods.js";
import { pounds } from "./buy.js";
import { formatAmount, shoppingAisles, unitLabel } from "./list.js";
import { parseAmount, unitIndex } from "./parse.js";
import { snapshotFileName, snapshotHtml } from "./snapshot.js";
import { ShopSync, syncLabel } from "./sync.js";

const POLL_MS = 10_000;               // refresh while the page is open
const CATALOG_MS = 10 * 60_000;       // package sizes, foods, units and aisles change rarely
const SAVE_AFTER_MS = 800;            // an amount change is sent once the − / + taps pause
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
const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", e => { e.stopPropagation(); onClick(e); }); return b; };
const when = ms => new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const api = tandoorApi();
const sync = new ShopSync({ api, store, onChange: draw });
let catalogAt = 0;
let drawn = "";
let toast = null, toastTimer = null;

// the add box: what's typed, the highlighted suggestion, whether suggestions show, the "which aisle?" state
const add = { text: "", sel: 0, shown: false, askNew: false, newAisle: null, busy: false };
// the open edit strip (a food id), and the amount being set while the − / + taps go on
let open = null, pending = null, saveTimer = null;

// matching indexes, rebuilt only when the catalog changes
let indexed = null, foods = [], units = new Map();
function indexes() {
  if (indexed !== sync.catalog) {
    indexed = sync.catalog;
    foods = foodIndex(sync.catalog.foods);
    units = unitIndex(sync.catalog.units);
  }
  return { foods, units };
}

function say(text) {
  toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; draw(); }, 3500);
  draw();
}
const failed = (e, what) => say(e.kind === "offline" ? `No signal: ${what} needs signal. Try again in a moment.`
  : e.kind === "signin" ? "Tandoor needs you to sign in again." : `Tandoor didn't take that (${what}). Try again.`);

function noteFor() {
  if (sync.problem === "signin") return ["Tandoor needs you to sign in again. ", Object.assign(el("a", null, "Sign in"), { href: "/accounts/login/?next=/shop/" })];
  if (sync.problem === "dropped") return ["Tandoor wouldn't take some ticks, so they were undone. Tick them again."];
  if (!sync.stored) return ["This phone isn't keeping ticks, so ticks made offline are lost if you close the page."];
  if (sync.problem && sync.savedAt) return [`Showing the list saved ${when(sync.savedAt)}.`];
  return null;
}

function byFood() {
  const m = new Map();
  for (const e of sync.view()) {
    if (!e.food) continue;
    if (!m.has(e.food.id)) m.set(e.food.id, []);
    m.get(e.food.id).push(e);
  }
  return m;
}

// --- changing an amount ------------------------------------------------------------------------

// an amount in a plan's units, for the strip
function planText(p, v, unit = p.unit) {
  if (v == null) return "—";
  if (v === 0) return "none";
  if (p.kind === "pack") return `${v} ${v === 1 ? p.label.name : p.label.pluralName || p.label.name}`;
  if (p.kind === "lb") return pounds(v * p.per);
  return formatAmount(v, unitLabel(unit, v));
}

function strip(r, p) {
  const box = el("div", "strip");
  box.addEventListener("click", e => e.stopPropagation());
  if (p.kind == null) {
    box.append(el("span", "why", "Mixed units: change this one on the tablet."));
    if (r.edited) box.append(btn("reset", "Reset", () => resetRow(r.key)));
    return box;
  }
  const why = r.edited ? `was ${r.was}${r.sub ? ` · ${r.sub}` : ""}` : (r.sub ?? (p.kind === "add" ? "no amount yet" : "on the list"));
  const cur = pending?.key === r.key ? pending : { key: r.key, value: p.value, unit: p.kind === "add" ? null : p.unit };
  const step = d => { pending = { ...cur, value: Math.max(0, Math.round(((cur.value ?? 0) + d) * 100) / 100) }; scheduleSave(); draw(); };
  const stepper = el("span", "step");
  stepper.append(btn("pm", "−", () => step(-p.step)), el("b", "val", planText(p, cur.value, cur.unit)), btn("pm", "+", () => step(p.step)));
  box.append(el("span", "why", why), stepper);
  if (p.kind === "add") {
    const chips = el("div", "chips");
    for (const u of p.choices) {
      chips.append(btn("chip" + ((cur.unit?.id ?? null) === (u?.id ?? null) ? " best" : ""), u ? u.name : "each", () => {
        pending = { ...cur, unit: u, value: cur.value ?? 1 }; scheduleSave(); draw();
      }));
    }
    box.append(chips);
  }
  if (r.edited) box.append(btn("reset", "Reset", () => resetRow(r.key)));
  return box;
}

function resetRow(key) {
  clearTimeout(saveTimer);
  saveTimer = null;
  pending = { key, reset: true };
  saveRow(key);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  const key = pending.key;
  saveTimer = setTimeout(() => { saveTimer = null; saveRow(key); }, SAVE_AFTER_MS);
}

// saves run one at a time, so a second tap can't plan from a list that lacks the first one's write
let saving = Promise.resolve();
function saveRow(key) {
  saving = saving.then(() => saveNow(key)).catch(() => {});
  return saving;
}

async function saveNow(key) {
  const want = pending?.key === key ? pending : null;
  const entries = byFood().get(key);
  if (!entries || !want) return;
  const p = plan(entries, sync.packages, sync.catalog.units);
  try {
    await setRowAmount(api, {
      plan: p, target: want.reset ? (p.was ?? 0) : want.value, unit: want.reset ? p.unit : want.unit,
      all: sync.view(), food: entries[0].food, done: entries.every(e => e.checked),
    });
    if (want.reset) open = null;
  } catch (e) {
    failed(e, "changing the amount");
  }
  await refreshAfterWrite();
  if (pending === want) pending = null;
  draw();
}

function toggleStrip(key) {
  if (saveTimer && pending) { clearTimeout(saveTimer); saveTimer = null; saveRow(pending.key); }
  open = open === key ? null : key;
  draw();
}

// --- the list ----------------------------------------------------------------------------------

function draw() {
  const aisles = shoppingAisles(sync.view(), sync.packages);
  const left = aisles.reduce((s, a) => s + a.left, 0);
  const pill = syncLabel({ problem: sync.problem, sending: sync.sending, waiting: sync.waiting(), left, fresh: sync.fresh });
  const unsent = new Set(sync.unsent());
  const note = noteFor();
  drawAdd();

  // redraw only when something on screen changes: a rebuild mid-tap would swallow the tap
  const key = JSON.stringify([aisles, pill, [...unsent], note?.map(n => typeof n === "string" ? n : n.href), sync.savedAt !== null,
    open, pending, toast, sync.catalog.units.length, Object.keys(sync.packages).length]);
  if (key === drawn) return;
  drawn = key;

  $("pill").textContent = pill.text;
  $("pill").className = "pill" + (pill.tone === "ok" ? "" : " " + pill.tone);
  $("note").hidden = !note;
  if (note) $("note").replaceChildren(...note);
  $("toast").hidden = !toast;
  $("toast").textContent = toast ?? "";

  const groups = byFood();
  const kids = [];
  for (const a of aisles) {
    const head = el("div", "aisle");
    head.append(el("span", null, a.name), el("span", null, `${a.left} left`));
    kids.push(head);
    for (const r of a.rows) {
      const p = plan(groups.get(r.key), sync.packages, sync.catalog.units);
      const row = el("div", "row" + (r.done ? " done" : "") + (r.ids.some(id => unsent.has(id)) ? " queued" : "") + (open === r.key ? " open" : ""));
      row.tabIndex = 0;
      row.setAttribute("role", "checkbox");
      row.setAttribute("aria-checked", String(r.done));
      const setting = pending?.key === r.key && !pending.reset;
      const none = p.kind === "add" && !setting;
      const shown = setting ? planText(p, pending.value, pending.unit) : (r.buy || r.amounts);
      const amount = btn("amt" + (r.buy && !none ? "" : " plain") + (r.edited || setting ? " edited" : "") + (none ? " add" : ""),
        none ? "+ amount" : (r.edited || setting ? "✎ " : "") + shown, () => toggleStrip(r.key));
      amount.setAttribute("aria-label", none ? `Add an amount for ${r.name}` : `Change the amount of ${r.name}`);
      row.append(el("span", "box", r.done ? "✓" : ""), el("span", "food", r.name), amount);
      if (open === r.key) row.append(strip(r, p));
      else if (r.sub || r.edited) row.append(el("span", "sub", r.edited ? `was ${r.was}${r.sub ? ` · ${r.sub}` : ""}` : r.sub));
      const tick = () => sync.set(r.ids, !r.done);
      row.addEventListener("click", tick);
      row.addEventListener("keydown", e => { if (e.target === row && (e.key === " " || e.key === "Enter")) { e.preventDefault(); tick(); } });
      kids.push(row);
    }
  }
  if (!kids.length) kids.push(el("p", "empty", sync.savedAt ? "Nothing on the list." : sync.problem ? "No saved list on this phone yet." : "Loading the list…"));
  $("list").replaceChildren(...kids);
}

// --- the add box -------------------------------------------------------------------------------

function addOptions() {
  const { foods, units } = indexes();
  const whole = exactFood(add.text, foods);
  const parsed = whole ? { amount: null, unit: null, rest: add.text.trim() } : parseAmount(add.text, units);
  if (!parsed.rest) return { parsed, hits: [], fresh: null };
  const hits = suggestFoods(parsed.rest, foods, 5, new Set(sync.view().filter(e => e.food).map(e => e.food.id)));
  const exact = exactFood(parsed.rest, foods);
  const fresh = exact || stillTyping(parsed.rest, hits) ? null : proposeFood(parsed.rest, foods, sync.catalog.categories);
  return { parsed, hits, fresh };
}

async function addNow(food) {
  if (add.busy) return;
  const { parsed } = addOptions();
  add.busy = true;
  drawAdd();
  try {
    const said = await addItem(api, { food, amount: parsed.amount, unit: parsed.unit, entries: sync.view(), catalog: sync.catalog });
    const amt = parsed.amount != null ? formatAmount(parsed.amount, unitLabel(parsed.unit, parsed.amount)) + " " : "";
    const aisle = food.id == null ? ` to ${typeof food.aisle === "string" ? food.aisle : food.aisle.name} (new food)` : "";
    say(said === "already" ? `${food.name} is already on the list` : said === "unticked" ? `${food.name} is back on the list` : `Added ${amt}${food.name}${aisle}`);
    Object.assign(add, { text: "", sel: 0, askNew: false, newAisle: null });
    $("add-in").value = "";
    $("aisle-in")?.blur();
    await refreshAfterWrite({ force: food.id == null });
  } catch (e) {
    failed(e, "adding");
  } finally {
    add.busy = false;
    drawAdd();
  }
}

function drawAdd() {
  // keep a half-typed aisle name: don't rebuild while its box has focus
  if (document.activeElement?.id === "aisle-in") return;
  $("add-in").disabled = add.busy;
  const { parsed, hits, fresh } = addOptions();
  const amt = parsed.amount != null ? formatAmount(parsed.amount, unitLabel(parsed.unit, parsed.amount)) : null;
  $("add-amt").hidden = !amt;
  $("add-amt").textContent = amt ? `${amt} ✓` : "";
  const onList = new Set(sync.view().filter(e => e.food && !e.checked).map(e => e.food.id));
  const kids = [];
  hits.forEach((h, i) => {
    const b = btn("opt" + (i === add.sel ? " best" : ""), null, () => addNow(h.food));
    if (amt) b.append(el("b", null, amt + " "));
    b.append(h.food.name, el("small", null, onList.has(h.food.id) ? "on the list · add more" : h.food.supermarket_category?.name ?? "Other"));
    kids.push(b);
  });
  if (fresh?.aisle) {
    const b = btn("opt" + (!hits.length ? " best" : ""), null, () => addNow({ name: fresh.name, aisle: fresh.aisle }));
    if (amt) b.append(el("b", null, amt + " "));
    b.append(`+ ${fresh.name}`, el("small", null, `new food · ${fresh.aisle.name}`));
    kids.push(b);
  } else if (fresh && hits.length && !add.askNew) {
    const b = btn("opt", null, () => { add.askNew = true; drawAdd(); });
    b.append(`+ “${fresh.name}” as a new food…`, el("small", null, "pick an aisle"));
    kids.push(b);
  } else if (fresh) {
    kids.push(el("p", "ask", `“${fresh.name}” is new. Which aisle?`));
    const chips = el("div", "chips");
    const rest = aisleOrder(indexes().foods, sync.catalog.categories).filter(c => !fresh.guesses.some(g => g.id === c.id));
    [...fresh.guesses, ...rest].forEach((c, i) =>
      chips.append(btn("chip" + (i < fresh.guesses.length ? " best" : ""), c.name, () => addNow({ name: fresh.name, aisle: c }))));
    chips.append(btn("chip", "+ new aisle…", () => { add.newAisle = ""; drawAdd(); $("aisle-in")?.focus(); }));
    kids.push(chips);
    if (add.newAisle !== null) {
      const line = el("div", "line");
      const input = Object.assign(el("input", "in"), { id: "aisle-in", placeholder: "Aisle name, e.g. Pet", value: add.newAisle, enterKeyHint: "done" });
      const go = () => { if (input.value.trim()) addNow({ name: fresh.name, aisle: input.value.trim() }); };
      input.addEventListener("input", () => { add.newAisle = input.value; });
      input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      line.append(input, btn("go", "Add", go));
      kids.push(line);
    }
  }
  $("add-sug").replaceChildren(...kids);
  $("add-sug").hidden = !kids.length || !add.shown;
}

$("add-in").addEventListener("input", e => { Object.assign(add, { text: e.target.value, sel: 0, shown: true, askNew: false, newAisle: null }); drawAdd(); });
$("add-in").addEventListener("focus", () => { add.shown = true; drawAdd(); });
$("add-in").addEventListener("keydown", e => {
  const { hits, fresh } = addOptions();
  if (e.key === "ArrowDown") { e.preventDefault(); add.sel = Math.min(add.sel + 1, Math.max(hits.length - 1, 0)); drawAdd(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); add.sel = Math.max(add.sel - 1, 0); drawAdd(); }
  else if (e.key === "Escape") { Object.assign(add, { text: "", shown: false }); e.target.value = ""; drawAdd(); }
  else if (e.key === "Enter") {
    if (hits[add.sel]) addNow(hits[add.sel].food);
    else if (fresh?.aisle) addNow({ name: fresh.name, aisle: fresh.aisle });
  }
});

// --- refresh, menu, start ---------------------------------------------------------------------

// one update at a time: polls, taps on the pill and coming back online all share it
let running = null;

// after a write, a refresh that starts now: one already running may have fetched before the write
async function refreshAfterWrite(opts) {
  await running?.catch(() => {});
  return update(opts);
}
function update({ force = false } = {}) {
  running ??= (async () => {
    await sync.flush();
    const catalog = force || Date.now() - catalogAt > CATALOG_MS;
    if (await sync.refresh({ catalog })) catalogAt = Date.now();
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

function toggleMenu(isOpen = $("menu").hidden) {
  $("menu").hidden = !isOpen;
  $("more").setAttribute("aria-expanded", String(isOpen));
}

$("more").addEventListener("click", () => toggleMenu());
$("save").addEventListener("click", () => { toggleMenu(false); saveCopy(); });
$("refresh").addEventListener("click", () => { toggleMenu(false); update({ force: true }); });
$("pill").addEventListener("click", () => update());
document.addEventListener("click", e => {
  if (!$("menu").hidden && !e.target.closest("#menu, #more")) toggleMenu(false);
  if (add.shown && !e.target.closest(".add")) { add.shown = false; drawAdd(); }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") update(); });
addEventListener("online", () => update());
setInterval(() => { if (document.visibilityState === "visible") update(); }, POLL_MS);
// aisle headings stick under the header, whose height changes with the add box
new ResizeObserver(() => document.documentElement.style.setProperty("--top", `${$("top").offsetHeight}px`)).observe($("top"));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/shop/sw.js", { scope: "/shop/", updateViaCache: "none" }).catch(() => {});

sync.load();
draw();
update({ force: true });
