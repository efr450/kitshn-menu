// The phone shopping page: wires ShopSync (sync.js) and AddQueue (queue.js) to the screen. Rules live
// in buy.js, list.js, sync.js, queue.js, parse.js, foods.js, edit.js and actions.js, which the tests
// cover; this file only draws and listens.

import { addItem, removeEntries, setRowAmount } from "./actions.js";
import { tandoorApi } from "./api.js";
import { isChange, plan } from "./edit.js";
import { aisleOrder, exactFood, foodIndex, proposeFood, stillTyping, suggestFoods } from "./foods.js";
import { PACKAGE_MARKER, buyChip, hasMarker, pounds, weighsFrom } from "./buy.js";
import { aisleWeighs, changes, packageProblem, parseSize, ruleProblem, saveFood, settingsOf, sizeText } from "./foodset.js";
import { ADDED, formatAmount, listSources, shoppingAisles, unitLabel } from "./list.js";
import { parseAmount, unitIndex } from "./parse.js";
import { AddQueue, isWaiting } from "./queue.js";
import { ShopSync, syncLabel } from "./sync.js";

const POLL_MS = 10_000;               // refresh while the page is open
const CATALOG_MS = 10 * 60_000;       // package sizes, foods, units and aisles change rarely
const SAVE_AFTER_MS = 800;            // an amount change is sent once the − / + taps pause
const UNDO_MS = 4000;                 // a delete waits this long for Undo before it goes to Tandoor
const HOLD_MS = 500;                  // hold a row this long to open its food's settings
const LINGER_MS = 1500;               // with "Hide checked items" on, a ticked row stays this long (to untick a mistake)
const LIST_KEY = "menu-shop-list";    // the last list: big, and only a convenience
const TICKS_KEY = "menu-shop-ticks";  // unsent ticks: small, kept apart so a big list can't crowd them out
const ADDS_KEY = "menu-shop-adds";    // adds made with no signal (queue.js)
const HIDE_KEY = "menu-shop-hide-checked";

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
const addStore = {
  load() { try { return JSON.parse(localStorage.getItem(ADDS_KEY)); } catch { return null; } },
  save(items) { try { localStorage.setItem(ADDS_KEY, JSON.stringify(items)); return true; } catch { return false; } },
};
const pref = {
  get(k) { try { return localStorage.getItem(k) === "1"; } catch { return false; } },
  set(k, on) { try { localStorage.setItem(k, on ? "1" : "0"); } catch { /* a convenience only */ } },
};

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", e => { e.stopPropagation(); onClick(e); }); return b; };
const when = ms => new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const api = tandoorApi();
const sync = new ShopSync({ api, store, onChange: draw });
const queue = new AddQueue({ store: addStore });
let catalogAt = 0;
let drawn = "";
let toast = null, toastTimer = null; // {text, undo?}

// the add box: what's typed, the highlighted suggestion, whether suggestions show, the "which aisle?" state
const add = { text: "", sel: 0, shown: false, askNew: false, newAisle: null, busy: false };
// the open edit strip (a food id), and the amount being set while the − / + taps go on
let open = null, pending = null, saveTimer = null;
// the recipe chip picked (a source key from list.js), "Hide checked items", and "Show" while it's on
let filter = null, hideChecked = pref.get(HIDE_KEY), peek = false;
const lingering = new Map(); // row key -> timer: just ticked, still shown while "Hide checked items" is on
const removing = new Set();  // entry ids deleted on the phone and waiting out Undo
let removal = null;          // the delete waiting out Undo: {commit}
let dragging = false, dirty = false; // a swipe in progress holds redraws, which would drop it

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

// foods that overrule their aisle on weight (buy.js), rebuilt only when the catalog changes
let weighed = null, weighsMap = {};
function weighs() {
  if (weighed !== sync.catalog) { weighed = sync.catalog; weighsMap = weighsFrom(sync.catalog.foods); }
  return weighsMap;
}

let later = null; // a message held back while an Undo toast is up
function say(text, { undo = null, ms = 3500 } = {}) {
  if (!undo && removal) { later = text; return; } // covering it would take Undo away
  toast = { text, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; draw(); }, ms);
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

// what's on screen: Tandoor's list with unsent ticks drawn in, plus adds waiting for signal, less deletes waiting out Undo
const shown = () => [...sync.view(), ...queue.asEntries(sync.catalog.units)].filter(e => !removing.has(e.id));
const waitingAdds = () => queue.items.filter(i => !i.checked).length;

// Tandoor's own entries per food: what amount changes plan from
function byFood() {
  const m = new Map();
  for (const e of sync.view()) {
    if (!e.food || removing.has(e.id)) continue;
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

// which recipes want this row, and how much each
function breakdown(r) {
  const box = el("div", "srcs");
  for (const s of r.sources) {
    const line = el("div", "src" + (s.key === filter ? " hl" : ""));
    const name = el("span", null, s.name);
    if (s.when) name.append(el("small", null, s.when));
    line.append(name, el("b", null, s.text));
    box.append(line);
  }
  return box;
}

function strip(r, p) {
  const box = el("div", "strip");
  box.addEventListener("click", e => e.stopPropagation());
  box.append(breakdown(r));
  if (!p) {
    box.append(el("span", "why", "Waiting to send: change the amount once there's signal."));
    return box;
  }
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

// writes run one at a time, so a second tap can't plan from a list that lacks the first one's write
let saving = Promise.resolve();
function serial(job) {
  saving = saving.then(job).catch(() => {});
  return saving;
}
const saveRow = key => serial(() => saveNow(key));

async function saveNow(key) {
  const want = pending?.key === key ? pending : null;
  const entries = byFood().get(key);
  if (!entries || !want) { if (want && pending === want) pending = null; return; } // deleted meanwhile
  const p = plan(entries, sync.packages, sync.catalog.units, weighs());
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

// --- ticking, deleting, clearing ----------------------------------------------------------------

function tick(r) {
  const done = !r.done;
  clearTimeout(lingering.get(r.key));
  lingering.delete(r.key);
  if (done && hideChecked) lingering.set(r.key, setTimeout(() => { lingering.delete(r.key); draw(); }, LINGER_MS));
  const waiting = r.ids.filter(isWaiting), real = r.ids.filter(id => !isWaiting(id));
  if (waiting.length) queue.set(waiting, done);
  if (real.length) sync.set(real, done);
  else draw();
}

/** Take these rows off the list now, and off Tandoor once Undo has had its chance. */
function removeLater(ids, text) {
  removal?.commit(); // only the newest delete can be undone; the one before goes now
  const waiting = ids.filter(isWaiting);
  const foods = new Set(shown().filter(e => ids.includes(e.id)).map(e => e.food?.id));
  for (const id of ids) removing.add(id);
  // an amount still being set on a deleted row goes with it
  if (pending && foods.has(pending.key)) { clearTimeout(saveTimer); saveTimer = null; pending = null; }
  let settled = false;
  const undo = () => me.undo();
  const timer = setTimeout(() => me.commit(), UNDO_MS);
  const settle = () => {
    settled = true;
    clearTimeout(timer);
    if (removal === me) removal = null;
    if (toast?.undo === undo) { toast = null; clearTimeout(toastTimer); }
    if (later) { const t = later; later = null; say(t); }
  };
  const me = {
    commit() {
      if (settled) return;
      settle();
      queue.remove(waiting);
      serial(async () => {
        // the entries now, so a change made just before the delete goes too
        const real = sync.view().filter(e => ids.includes(e.id) || (foods.has(e.food?.id) && isChange(e))).map(e => e.id);
        try {
          if (real.length) await removeEntries(api, real, sync.view());
          // deleted: they stay hidden (Tandoor no longer has them), even if this refresh fails
          await refreshAfterWrite().catch(() => {});
        } catch (e) {
          for (const id of ids) removing.delete(id); // not deleted: show them again
          failed(e, "deleting");
        }
        draw();
      });
      draw();
    },
    undo() {
      if (settled) return;
      settle();
      for (const id of ids) removing.delete(id);
      draw();
    },
  };
  removal = me;
  if (open && foods.has(open)) open = null;
  say(text, { undo, ms: UNDO_MS });
}

function clearChecked() {
  const rows = shoppingAisles(shown(), sync.packages, weighs()).flatMap(a => a.rows).filter(r => r.done);
  if (!rows.length) return;
  removeLater(rows.flatMap(r => r.ids), `Cleared ${rows.length} checked ${rows.length === 1 ? "item" : "items"}`);
}

// swipe a row left past 40% of its width to delete it; vertical moves are left to scrolling
function swipeable(wrap, row, onDelete) {
  let x0 = null, y0 = 0, dx = 0, sliding = false;
  const reset = () => { x0 = null; sliding = false; dragging = false; wrap.classList.remove("drag"); if (dirty) { dirty = false; draw(); } };
  row.addEventListener("pointerdown", e => {
    delete row.dataset.swiped;
    if (e.button || e.target.closest(".strip")) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; sliding = false;
  });
  row.addEventListener("pointermove", e => {
    if (x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!sliding) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
      if (mx > -12 || Math.abs(mx) < Math.abs(my)) return;
      sliding = dragging = true;
      wrap.classList.add("drag");
      try { row.setPointerCapture(e.pointerId); } catch { /* the pointer already went: the swipe still works without it */ }
    }
    dx = Math.min(0, mx);
    row.style.transform = `translateX(${dx}px)`;
  });
  row.addEventListener("pointerup", () => {
    if (x0 === null) return;
    const slid = sliding;
    if (slid) { row.dataset.swiped = "1"; setTimeout(() => delete row.dataset.swiped, 400); } // the click that follows (if any) isn't a tick
    if (slid && -dx > wrap.clientWidth * 0.4) {
      row.style.transform = "translateX(-110%)";
      x0 = null; sliding = false; dragging = false; wrap.classList.replace("drag", "gone");
      setTimeout(onDelete, 160);
      return;
    }
    row.style.transform = "";
    reset();
  });
  row.addEventListener("pointercancel", () => { row.style.transform = ""; reset(); });
  // the click that ends a swipe neither ticks the row nor opens its amount
  wrap.addEventListener("click", e => { if (row.dataset.swiped) { delete row.dataset.swiped; e.stopPropagation(); } }, true);
}

// --- the list ----------------------------------------------------------------------------------

function draw() {
  if (dragging) { dirty = true; return; }
  const all = shown();
  const aisles = shoppingAisles(all, sync.packages, weighs());
  const left = aisles.reduce((s, a) => s + a.left, 0);
  const pill = syncLabel({ problem: sync.problem, sending: sync.sending, waiting: sync.waiting() + waitingAdds(), left, fresh: sync.fresh, online: navigator.onLine !== false });
  const unsent = new Set(sync.unsent());
  const note = noteFor();
  const sources = listSources(all);
  if (filter && !sources.some(s => s.key === filter)) filter = null;
  drawAdd();

  // redraw only when something on screen changes: a rebuild mid-tap would swallow the tap
  const key = JSON.stringify([aisles, pill, [...unsent], note?.map(n => typeof n === "string" ? n : n.href), sync.savedAt !== null,
    open, pending, toast && [toast.text, !!toast.undo], sync.catalog.units.length, Object.keys(sync.packages).length,
    sources, filter, hideChecked, peek, [...lingering.keys()]]);
  if (key === drawn) return;
  drawn = key;

  $("pill").textContent = pill.text;
  $("pill").className = "pill" + (pill.tone === "ok" ? "" : " " + pill.tone);
  $("note").hidden = !note;
  if (note) $("note").replaceChildren(...note);
  $("toast").hidden = !toast;
  $("toast").replaceChildren(...(toast ? [el("span", null, toast.text), ...(toast.undo ? [btn("undo", "Undo", toast.undo)] : [])] : []));
  drawSources(sources);

  const groups = byFood();
  const hide = r => hideChecked && !peek && r.done && !lingering.has(r.key);
  let hidden = 0;
  const kids = [];
  for (const a of aisles) {
    const rows = a.rows.filter(r => { if (hide(r)) { hidden++; return false; } return true; });
    if (!rows.length) continue;
    const head = el("div", "aisle");
    head.append(el("span", null, a.name), el("span", null, `${a.left} left`));
    kids.push(head);
    for (const r of rows) kids.push(rowView(r, groups.get(r.key), unsent));
  }
  if (hideChecked && (hidden || peek)) {
    const foot = btn("foot", null, () => { peek = !peek; draw(); });
    if (peek) foot.append("Hide checked again");
    else foot.append(`${hidden} checked hidden · `, el("b", null, "Show"));
    kids.push(foot);
  }
  if (!kids.length) kids.push(el("p", "empty", sync.savedAt ? "Nothing on the list." : sync.problem ? "No saved list on this phone yet." : "Loading the list…"));
  else if (!kids.some(k => k.classList.contains("swipe"))) kids.unshift(el("p", "empty", "All done."));
  $("list").replaceChildren(...kids);
}

function rowView(r, entries, unsent) {
  const p = entries ? plan(entries, sync.packages, sync.catalog.units, weighs()) : null; // null: only waiting adds
  const waiting = r.ids.some(isWaiting);
  const mine = filter && r.sources.find(s => s.key === filter);
  const row = el("div", "row" + (r.done ? " done" : "") + (waiting || r.ids.some(id => unsent.has(id)) ? " queued" : "")
    + (open === r.key ? " open" : "") + (lingering.has(r.key) ? " going" : "") + (filter && !mine ? " dim" : ""));
  row.tabIndex = 0;
  row.setAttribute("role", "checkbox");
  row.setAttribute("aria-checked", String(r.done));
  const setting = pending?.key === r.key && !pending.reset;
  const none = p?.kind === "add" && !setting && !waiting;
  const text = setting ? planText(p, pending.value, pending.unit) : (r.buy || r.amounts);
  const amount = btn("amt" + (r.buy && !none ? "" : " plain") + (r.edited || setting ? " edited" : "") + (none ? " add" : ""),
    none ? "+ amount" : (r.edited || setting ? "✎ " : "") + (text || "—"), () => toggleStrip(r.key));
  amount.setAttribute("aria-label", none ? `Add an amount for ${r.name}` : `Change the amount of ${r.name}`);
  row.append(el("span", "box", r.done ? "✓" : ""), el("span", "food", r.name), amount);
  if (open === r.key) row.append(strip(r, p));
  else if (mine) {
    const total = r.buy || r.amounts;
    row.append(el("span", "sub for", `${mine.name}: ${mine.text}${total && total !== mine.text && r.sources.length > 1 ? ` of ${total}` : ""}`));
  } else if (waiting) row.append(el("span", "sub", r.ids.every(isWaiting) && typeof r.key === "string" ? "new food · waiting to send" : "waiting to send"));
  else if (r.sub || r.edited) row.append(el("span", "sub", r.edited ? `was ${r.was}${r.sub ? ` · ${r.sub}` : ""}` : r.sub));
  row.addEventListener("click", () => tick(r));
  row.addEventListener("keydown", e => {
    if (e.target !== row) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); tick(r); }
    if (e.key === "Delete") removeLater(r.ids, `Deleted ${r.name}`);
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); openSheet(r); }
  });
  const wrap = el("div", "swipe");
  wrap.append(el("span", "bin", "Delete"), row);
  swipeable(wrap, row, () => removeLater(r.ids, `Deleted ${r.name}`));
  holdable(row, () => openSheet(r));
  return wrap;
}

// the recipe chips: touch one to bring its items forward (with its amounts), again to let go
function drawSources(sources) {
  const box = $("srcs");
  box.hidden = !sources.some(s => s.key !== ADDED);
  if (box.hidden) filter = null;
  const chip = (key, label, n) => {
    const b = btn("rchip" + (filter === key ? " on" : ""), label, () => { filter = filter === key || key === null ? null : key; open = null; draw(); });
    if (n != null) b.append(el("small", null, String(n)));
    b.setAttribute("aria-pressed", String(filter === key));
    return b;
  };
  const twice = name => sources.filter(s => s.name === name).length > 1;
  box.replaceChildren(chip(null, "All"), ...sources.map(s => chip(s.key, twice(s.name) && s.when ? `${s.name} · ${s.when}` : s.name, s.left)));
  fadeEdges();
}

// a soft right edge while more chips are off screen, so the row reads as scrollable
function fadeEdges() {
  const box = $("srcs");
  box.classList.toggle("more", box.scrollWidth - box.scrollLeft - box.clientWidth > 4);
}

// --- the add box -------------------------------------------------------------------------------

function addOptions() {
  const { foods, units } = indexes();
  const whole = exactFood(add.text, foods);
  const parsed = whole ? { amount: null, unit: null, rest: add.text.trim() } : parseAmount(add.text, units);
  if (!parsed.rest) return { parsed, hits: [], fresh: null };
  const hits = suggestFoods(parsed.rest, foods, 5, new Set(shown().filter(e => e.food).map(e => e.food.id)));
  const exact = exactFood(parsed.rest, foods);
  const fresh = exact || stillTyping(parsed.rest, hits) ? null : proposeFood(parsed.rest, foods, sync.catalog.categories);
  return { parsed, hits, fresh };
}

const aisleName = food => food.id != null ? null : typeof food.aisle === "string" ? food.aisle : food.aisle?.name ?? "Other";

async function addNow(food) {
  if (add.busy) return;
  const { parsed } = addOptions();
  const amt = parsed.amount != null ? formatAmount(parsed.amount, unitLabel(parsed.unit, parsed.amount)) + " " : "";
  const aisle = food.id == null ? ` to ${aisleName(food)} (new food)` : "";
  let made = food;
  const keep = tried => {
    const kept = queue.push({ food: made, amount: parsed.amount, unit: parsed.unit, tried });
    say(kept ? `Saved ${amt}${food.name}${aisle}: it goes to Tandoor when there's signal`
      : `This phone couldn't save ${food.name}. Add it again when there's signal.`);
    if (kept && sync.problem !== "offline" && navigator.onLine !== false) update(); // signal may be back: send it now
  };
  add.busy = true;
  drawAdd();
  try {
    // known to be offline: keep it now rather than wait out a request
    if (sync.problem === "offline" || navigator.onLine === false || queue.length) keep(false);
    else {
      const said = await addItem(api, { food, amount: parsed.amount, unit: parsed.unit, entries: sync.view(), catalog: sync.catalog, onFood: f => { made = f; } });
      say(said === "already" ? `${food.name} is already on the list` : said === "unticked" ? `${food.name} is back on the list` : `Added ${amt}${food.name}${aisle}`);
      await refreshAfterWrite({ force: food.id == null });
    }
    Object.assign(add, { text: "", sel: 0, askNew: false, newAisle: null });
    $("add-in").value = "";
    $("aisle-in")?.blur();
  } catch (e) {
    if (e.kind === "offline") {
      keep(true); // it may have reached Tandoor before the signal went: the resend checks first
      Object.assign(add, { text: "", sel: 0, askNew: false, newAisle: null });
      $("add-in").value = "";
    } else failed(e, "adding");
  } finally {
    add.busy = false;
    drawAdd();
    draw();
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
  const onList = new Set(shown().filter(e => e.food && !e.checked).map(e => e.food.id));
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
    // sort it later: Tandoor files a food with no aisle under Other
    chips.append(btn("chip", "Other (sort later)", () => addNow({ name: fresh.name, aisle: null })));
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

// Enter (the keyboard's ✓) adds at once, never asking: the food typed if Tandoor knows it, a
// suggestion picked with the arrow keys, else a new food in its one sure aisle or in Other to sort later
function quickAdd(hits, fresh) {
  const { parsed } = addOptions();
  if (!parsed.rest) return;
  const known = exactFood(parsed.rest, indexes().foods);
  if (known) addNow(known);
  else if (add.sel > 0 && hits[add.sel]) addNow(hits[add.sel].food);
  else {
    const name = fresh?.name ?? proposeFood(parsed.rest, indexes().foods, sync.catalog.categories).name;
    addNow({ name, aisle: fresh?.aisle ?? null });
  }
}

$("add-in").addEventListener("input", e => { Object.assign(add, { text: e.target.value, sel: 0, shown: true, askNew: false, newAisle: null }); drawAdd(); });
$("add-in").addEventListener("focus", () => { add.shown = true; drawAdd(); });
$("add-in").addEventListener("keydown", e => {
  const { hits, fresh } = addOptions();
  if (e.key === "ArrowDown") { e.preventDefault(); add.sel = Math.min(add.sel + 1, Math.max(hits.length - 1, 0)); drawAdd(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); add.sel = Math.max(add.sel - 1, 0); drawAdd(); }
  else if (e.key === "Escape") { Object.assign(add, { text: "", shown: false }); e.target.value = ""; drawAdd(); }
  else if (e.key === "Enter") quickAdd(hits, fresh);
});

// --- a food's settings (hold its row) -------------------------------------------------------------

// hold a row this long to open its food's settings; moving first is a scroll or a swipe
function holdable(row, onHold) {
  let timer = null, x0 = 0, y0 = 0;
  const stop = () => { clearTimeout(timer); timer = null; row.classList.remove("hold"); };
  // the click that follows the release isn't a tick, however long the hold lasted
  row.addEventListener("pointerup", () => { if (row.dataset.held) setTimeout(() => delete row.dataset.held, 350); });
  row.addEventListener("pointerdown", e => {
    if (e.button || e.target.closest(".strip")) return;
    x0 = e.clientX; y0 = e.clientY;
    row.classList.add("hold");
    timer = setTimeout(() => {
      stop();
      row.dataset.held = "1";
      navigator.vibrate?.(15);
      onHold();
    }, HOLD_MS);
  });
  row.addEventListener("pointermove", e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) stop(); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) row.addEventListener(ev, stop);
  row.addEventListener("contextmenu", e => e.preventDefault()); // a long touch would open the browser's menu
  row.addEventListener("click", e => { if (row.dataset.held) { delete row.dataset.held; e.stopImmediatePropagation(); } }, true);
}

// the open sheet: the food (catalog copy), the row it came from, where it started, and the edits
let sheet = null, scrimDown = false;

function openSheet(r) {
  const food = sync.catalog.foods.find(f => f.id === r.key);
  if (!food) { say(`${r.name} isn't in Tandoor yet. Hold it again once it's sent.`); return; }
  const now = settingsOf(food, sync.packages, weighs());
  sheet = { food, row: r, now, aisle: now.aisle, mode: now.mode, modeSet: false, pkgName: now.pkg?.name ?? "",
    pkgSize: now.pkg ? sizeText(now.pkg.grams) : "", newAisle: null, busy: false };
  scrimDown = false;
  drawSheet();
  $("sheet").focus();
}

function closeSheet() {
  sheet = null;
  $("sheet").hidden = $("scrim").hidden = true;
}

// what Save would write, or a reason it can't
function sheetPlan() {
  const s = sheet;
  // a new aisle typed but not confirmed with Use still counts
  const typed = s.newAisle?.trim();
  const aisle = typed ? sync.catalog.categories.find(c => c.name.toLowerCase() === typed.toLowerCase()) ?? typed : s.aisle;
  if (s.mode === "package") {
    const problem = packageProblem(s.pkgName, s.pkgSize, sync.catalog.units);
    if (problem) return { problem };
  }
  const pkg = s.mode === "package" ? { name: s.pkgName.trim(), grams: parseSize(s.pkgSize) } : null;
  const plan = changes(s.food, s.now, { aisle, mode: s.mode, pkg });
  const problem = "rule" in plan ? ruleProblem(s.food.description, plan.rule) : null;
  return problem ? { problem } : { plan, pkg };
}

// the row's entries as buy.js reads them, for the preview
const buyLines = key => (byFood().get(key) ?? []).map(e => ({ amount: e.amount, unitName: e.unit?.name ?? null, unitBaseUnit: e.unit?.base_unit ?? null, checked: e.checked }));

function drawSheet() {
  const s = sheet;
  const box = $("sheet");
  $("sheet").hidden = $("scrim").hidden = false;
  const head = el("div", "s-head");
  head.append(el("b", null, s.food.name), el("span", null, s.row.amounts ? `On the list: ${s.row.amounts}` : "No amount on the list"));

  // aisles: the busiest first, then Other (no aisle) and a new one
  const chips = el("div", "chips");
  const pickAisle = a => {
    s.aisle = a; s.newAisle = null;
    // the way it's bought follows the aisle until it's set here, unless the food has its own rule
    if (!s.modeSet && !s.now.ownRule && s.mode !== "package") s.mode = aisleWeighs(typeof a === "string" ? null : a) ? "weight" : "count";
    drawSheet();
  };
  const isAisle = a => (s.aisle?.id ?? s.aisle) === (a?.id ?? a);
  for (const c of aisleOrder(indexes().foods, sync.catalog.categories)) chips.append(btn("chip" + (isAisle(c) ? " best" : ""), c.name, () => pickAisle(c)));
  if (typeof s.aisle === "string") chips.append(btn("chip best", s.aisle, () => {}));
  chips.append(btn("chip" + (s.aisle == null ? " best" : ""), "Other", () => pickAisle(null)));
  chips.append(btn("chip", "+ new aisle…", () => { s.newAisle = ""; drawSheet(); $("sheet-aisle")?.focus(); }));
  const kids = [head, el("h3", null, "Aisle"), chips];
  if (s.newAisle !== null) {
    const line = el("div", "line");
    const input = Object.assign(el("input", "in"), { id: "sheet-aisle", placeholder: "Aisle name, e.g. Pet", value: s.newAisle, enterKeyHint: "done" });
    const go = () => {
      const name = input.value.trim();
      if (name) pickAisle(sync.catalog.categories.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? name);
    };
    input.addEventListener("input", () => { s.newAisle = input.value; paintSheet(); });
    input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    line.append(input, btn("go", "Use", go));
    kids.push(line);
  }

  // how it's bought
  const seg = el("div", "seg");
  const mode = (m, label, sub) => {
    const b = btn(s.mode === m ? "on" : "", label, () => { s.mode = m; s.modeSet = true; drawSheet(); });
    b.append(el("small", null, sub));
    b.setAttribute("aria-pressed", String(s.mode === m));
    return b;
  };
  seg.append(mode("count", "Count", "as the list says"), mode("weight", "Weight", "in lb"), mode("package", "Package", s.pkgName.trim() || "carton, bag…"));
  kids.push(el("h3", null, "Buy as"), seg);
  if (s.mode === "package") {
    const pkg = el("div", "pkg");
    const field = (label, id, value, placeholder, set, list) => {
      const l = el("label", null, label);
      const input = Object.assign(el("input"), { id, value, placeholder, autocomplete: "off", enterKeyHint: "done" });
      if (list) input.setAttribute("list", list);
      input.addEventListener("input", () => { set(input.value); paintSheet(); });
      l.append(input);
      return l;
    };
    const names = el("datalist");
    names.id = "pkg-names";
    for (const u of sync.catalog.units) if (hasMarker(u.description, PACKAGE_MARKER)) names.append(Object.assign(el("option"), { value: u.name }));
    pkg.append(field("Called", "pkg-name", s.pkgName, "half-gallon", v => { s.pkgName = v; }, "pkg-names"),
      field("Holds", "pkg-size", s.pkgSize, "1.9 kg", v => { s.pkgSize = v; }), names);
    kids.push(pkg);
  }
  kids.push(el("div", "prev"), el("p", "s-note"));
  const actions = el("div", "s-actions");
  actions.append(btn("chip", "Cancel", closeSheet), Object.assign(btn("go", s.busy ? "Saving…" : "Save", saveSheet), { id: "sheet-save" }));
  kids.push(actions);
  box.replaceChildren(...kids);
  paintSheet();
}

// the parts that change while the package fields are typed in (redrawing would drop the keyboard)
function paintSheet() {
  const s = sheet;
  const { plan, pkg, problem } = sheetPlan();
  const lines = buyLines(s.row.key);
  const chip = problem ? null : buyChip(lines, s.mode === "weight", pkg && { name: pkg.name, pluralName: null, grams: pkg.grams });
  const prev = $("sheet").querySelector(".prev");
  prev.replaceChildren(el("span", null, "On the list"), el("b", null, problem ? "—" : chip?.label ?? (s.row.amounts || "no amount")));
  const note = problem ?? (s.mode !== "count" && !chip && lines.some(l => l.amount !== 0) ? "Its amounts aren't weights, so the list keeps showing them as they are."
    : plan && "rule" in plan ? "The tablet goes by the aisle for weight until its next update." : "Changes this food on every list.");
  const n = $("sheet").querySelector(".s-note");
  n.textContent = note;
  n.classList.toggle("bad", !!problem);
  $("sheet-save").disabled = s.busy || !!problem || !plan || !Object.keys(plan).length;
}

async function saveSheet() {
  const s = sheet;
  const { plan } = sheetPlan();
  if (!plan || !Object.keys(plan).length) return;
  s.busy = true;
  drawSheet();
  let error = null;
  await serial(async () => { try { await saveFood(api, s.food, plan, sync.catalog); } catch (e) { error = e; } });
  if (error) {
    failed(error, "saving the food");
    // part of it may have gone in (a new aisle or unit): start a retry from what Tandoor has now
    await refreshAfterWrite({ force: true }).catch(() => {});
    s.busy = false;
    const fresh = sync.catalog.foods.find(f => f.id === s.food.id);
    if (fresh) { s.food = fresh; s.now = settingsOf(fresh, sync.packages, weighs()); }
    if (sheet === s) drawSheet();
    return;
  }
  if (sheet === s) closeSheet();
  say("aisle" in plan ? `Moved ${s.food.name} to ${typeof plan.aisle === "string" ? plan.aisle : plan.aisle?.name ?? "Other"}` : `Saved ${s.food.name}`);
  await refreshAfterWrite({ force: true }); // the catalog too: package sizes and food rules live there
  draw();
}

// only a touch that starts on the shade closes the sheet, not the release of the hold that opened it
$("scrim").addEventListener("pointerdown", () => { scrimDown = true; });
$("scrim").addEventListener("click", () => { if (scrimDown) closeSheet(); });
$("sheet").addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

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
    if (queue.length && (!sync.problem || sync.problem === "dropped")) await sendAdds();
  })().finally(() => { running = null; });
  return running;
}

// adds kept while offline go now, one at a time, each planned from a list that has the one before
async function sendAdds() {
  const r = await queue.send(api, { entries: () => sync.view(), catalog: () => sync.catalog, onSent: () => sync.refresh(),
    skip: id => removing.has(id) });
  if (r.sent && await sync.refresh({ catalog: true })) catalogAt = Date.now(); // new foods join the catalog
  if (r.dropped.length) say(`Tandoor didn't take ${r.dropped.join(", ")}. Add ${r.dropped.length === 1 ? "it" : "them"} again.`);
  else if (r.sent && !r.stopped) say(`Sent ${r.sent} saved ${r.sent === 1 ? "item" : "items"} to the list`);
  draw();
}

function toggleMenu(isOpen = $("menu").hidden) {
  $("menu").hidden = !isOpen;
  $("more").setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) return;
  const checked = shoppingAisles(shown(), sync.packages, weighs()).flatMap(a => a.rows).filter(r => r.done).length;
  $("clear").disabled = !checked;
  $("clear").firstChild.textContent = checked ? `Clear checked (${checked})` : "Clear checked";
  $("hide").setAttribute("aria-checked", String(hideChecked));
  $("hide-why").textContent = hideChecked ? "ticked items leave the list" : "ticked items stay, crossed out";
}

$("more").addEventListener("click", () => toggleMenu());
$("hide").addEventListener("click", () => {
  hideChecked = !hideChecked;
  peek = false;
  pref.set(HIDE_KEY, hideChecked);
  toggleMenu(true);
  draw();
});
$("clear").addEventListener("click", () => { toggleMenu(false); clearChecked(); });
$("refresh").addEventListener("click", () => { toggleMenu(false); update({ force: true }); });
$("pill").addEventListener("click", () => {
  // the page retries by itself every 10 s; a touch retries now and says why it may not work
  if (sync.problem === "offline" && navigator.onLine !== false) say("Can't reach home. Check that Tailscale is on, then wait a moment.");
  update();
});
$("srcs").addEventListener("scroll", fadeEdges, { passive: true });
document.addEventListener("click", e => {
  // a touch outside the open menu only closes it: it mustn't also tick the row underneath
  if (!$("menu").hidden && !e.target.closest("#menu, #more, #toast")) { toggleMenu(false); e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener("click", e => {
  if (add.shown && !e.target.closest(".add")) { add.shown = false; drawAdd(); }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") update();
  else removal?.commit(); // leaving the page: a delete waiting on Undo goes now, rather than never
});
addEventListener("online", () => update());
addEventListener("resize", fadeEdges);
setInterval(() => { if (document.visibilityState === "visible") update(); }, POLL_MS);
// aisle headings stick under the header, whose height changes with the add box
new ResizeObserver(() => document.documentElement.style.setProperty("--top", `${$("top").offsetHeight}px`)).observe($("top"));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/shop/sw.js", { scope: "/shop/", updateViaCache: "none" }).catch(() => {});

sync.load();
queue.load();
draw();
update({ force: true });
