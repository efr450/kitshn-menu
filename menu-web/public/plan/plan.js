// Menu fork: the Plan chat page (Workbench "plan-chat", option A "Just the chat"). Chat with Claude
// about what to eat; it puts meals on the Meal Plan and the shopping list, and each change shows as a
// chip with Undo. Rules live in ../planchat.js; this file only draws and listens.

import { appBridge } from "../inbox.js";
import { STARTERS, WHO_KEY, adderLabel, blocks, confirmLabels, mealNote, merge, pickWho, planApi } from "../planchat.js";

const app = appBridge();
const api = planApi({ bridge: app });
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", onClick); return b; };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: asks again next time */ } } };

let people = [], who = null, chats = [];
let chat = null;            // {id, items, version, busy, partial}
let poll = null;            // the long-poll's AbortController
let sending = false;

let toastTimer = null;
function say(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
function trouble(e) {
  if (e.kind === "signin") {
    const n = $("note");
    if (app) n.replaceChildren("Tandoor did not accept the Menu app's sign-in. Sign out and in again in Settings.");
    else n.replaceChildren("Sign in to Tandoor first. ", Object.assign(el("a", null, "Sign in"), { href: "/accounts/login/?next=/shop/plan/" }));
    n.hidden = false;
  } else say(e.kind === "offline" ? "No signal. Try again in a moment." : e.message);
}

// --- who is typing -----------------------------------------------------------------------------

function drawWho() {
  const box = $("who");
  box.classList.toggle("ask", !who);
  box.replaceChildren(...people.map(p => {
    const b = btn("", p.name, () => { who = p.key; store.set(WHO_KEY, who); drawWho(); drawThread(true); });
    b.setAttribute("aria-pressed", String(who === p.key));
    return b;
  }));
}
const nameOf = key => (people.find(p => p.key === key) || {}).name || key;

// --- the thread --------------------------------------------------------------------------------

const nodes = new Map();    // seq -> [json, node]: a redraw replaces only what changed
let streamNode = null;

function textMsg(item) {
  const mine = item.who === who, claude = item.who === "claude";
  const n = el("div", `msg ${claude ? "claude" : mine ? "me" : "other"}`);
  if (!claude) n.append(el("small", null, nameOf(item.who)));
  if (claude) fillMarkdown(n, item.text); else n.append(el("span", null, item.text));
  return n;
}
function fillMarkdown(n, text) {
  let list = null;
  for (const b of blocks(text)) {
    const line = el(b.type === "li" ? "li" : "p");
    for (const part of b.parts) line.append(part.bold ? el("b", null, part.text) : document.createTextNode(part.text));
    if (b.type === "li") { if (!list) { list = el("ul"); n.append(list); } list.append(line); }
    else { list = null; n.append(line); }
  }
}
function chipNode(item) {
  const n = el("div", "chip" + (item.undone ? " undone" : ""));
  n.append(el("span", null, `${item.icon || "✎"} ${item.text}`));
  if (!item.undone) n.append(btn("undo", "Undo", () => undo(item)));
  return n;
}
function planNode(item) {
  const n = el("div", "card");
  n.append(el("h3", null, "Plan"));
  for (const d of item.days) {
    const row = el("div", "day"), meals = el("div", "meals");
    row.append(el("b", null, d.label));
    if (!d.meals.length) meals.append(el("span", "none", "—"));
    for (const m of d.meals) {
      const line = el("span", null, m.title);
      line.append(el("small", null, (m.meal !== "Dinner" ? `${m.meal} · ` : "") + mealNote(m)));
      meals.append(line);
    }
    row.append(meals);
    n.append(row);
  }
  return n;
}
function adderNode(item) {
  const n = el("div", "card");
  n.append(el("h3", null, "Recipe adder"));
  const title = item.title || (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })();
  n.append(el("span", null, title));
  const state = el("span", "state" + (item.state === "done" ? " ok" : item.state === "failed" ? " bad" : ""), adderLabel(item));
  n.append(state);
  if (item.job) n.append(Object.assign(el("a", null, "Open in Add/Monitor"), { href: `/shop/add/?job=${encodeURIComponent(item.job)}` }));
  return n;
}
// Claude offered something only a person's tap does: hand a link to the recipe adder, or save a profile note
function confirmNode(item) {
  const n = el("div", "card");
  n.append(el("span", null, item.text));
  if (item.action === "adder") {
    try { n.append(el("span", "state", new URL(item.url).hostname)); } catch { /* shown without its site */ }
  }
  if (item.state === "ask") {
    const labels = confirmLabels(item), row = el("div", "choices");
    row.append(btn("btn", labels.yes, () => answer(item, true)), btn("btn quiet", labels.no, () => answer(item, false)));
    n.append(row);
  } else n.append(el("span", "state" + (item.state === "yes" ? " ok" : ""), item.state === "yes" ? "✓ Saved" : item.action === "adder" ? "Not added" : "Not saved"));
  return n;
}
function itemNode(item) {
  if (item.kind === "text") return textMsg(item);
  if (item.kind === "confirm") return confirmNode(item);
  if (item.kind === "change") return chipNode(item);
  if (item.kind === "plan") return planNode(item);
  if (item.kind === "adder") return adderNode(item);
  return el("div", "notice", item.text || "");
}

function nearBottom() { const t = $("thread"); return t.scrollHeight - t.scrollTop - t.clientHeight < 80; }
function toBottom() { const t = $("thread"); t.scrollTop = t.scrollHeight; }

function drawThread(full = false) {
  const t = $("thread"), stick = nearBottom();
  if (full) { nodes.clear(); t.replaceChildren(); streamNode = null; }
  const items = chat ? chat.items : [];
  if (!items.length && !(chat && chat.busy)) {
    nodes.clear(); streamNode = null;
    t.replaceChildren(el("p", "hello", who ? "What sounds good for the next few days?" : "Touch your name at the top, then tell Claude what sounds good."));
    drawStarters();
    return;
  }
  t.querySelector(".hello")?.remove();
  for (const item of items) {
    const json = JSON.stringify(item), had = nodes.get(item.seq);
    if (had && had[0] === json) continue;
    const node = itemNode(item);
    if (had) had[1].replaceWith(node); else t.insertBefore(node, streamNode);
    nodes.set(item.seq, [json, node]);
  }
  // the reply being written: streamed text with a caret, or dots before the first word
  if (chat && chat.busy) {
    if (!streamNode) { streamNode = el("div"); t.append(streamNode); }
    if (chat.partial) { streamNode.className = "msg claude typing"; streamNode.replaceChildren(); fillMarkdown(streamNode, chat.partial); }
    else { streamNode.className = "dots"; streamNode.textContent = "•••"; }
  } else if (streamNode) { streamNode.remove(); streamNode = null; }
  drawStarters();
  if (stick || full) toBottom();
}

function drawStarters() {
  const empty = !chat || !chat.items.length;
  $("starters").replaceChildren(...(empty ? STARTERS.map(s => btn("", s, () => send(s))) : []));
}

// --- talking to home ---------------------------------------------------------------------------

function apply(view) {
  if (!chat || chat.id !== view.id) chat = { id: view.id, items: [], version: 0 };
  chat.items = merge(chat.items, view.items || []);
  Object.assign(chat, { version: view.version, busy: view.busy, partial: view.partial || "" });
  drawThread();
}

async function listen() {
  poll?.abort();
  const mine = poll = new AbortController();
  let wait = 0;
  while (chat && poll === mine) {
    try {
      const last = chat.items.length ? chat.items[chat.items.length - 1].seq : 0;
      const view = await api.chat(chat.id, chat.version, last, mine.signal);
      if (poll !== mine) return;
      apply(view);
      $("note").hidden = true;
      wait = 0;
    } catch (e) {
      if (poll !== mine) return;
      if (e.kind === "signin") trouble(e);  // shown, but keep trying: Tandoor may only be restarting
      wait = Math.min((wait || 1000) * 2, 15000);  // offline or home restarting: back off, keep trying
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function open(id) {
  poll?.abort();
  chat = null; drawThread(true);
  try {
    apply(await api.chat(id));
    drawThread(true);
    listen();
  } catch (e) { trouble(e); }
}

async function send(text) {
  text = (text ?? $("text").value).trim();
  if (!text || sending) return;
  if (!who) { say("Touch your name at the top first."); $("who").focus?.(); return; }
  sending = true; $("send").disabled = true;
  try {
    if (!chat) { const c = await api.newChat(); apply(c); listen(); }
    apply(await api.send(chat.id, who, text));
    if ($("text").value.trim() === text) { $("text").value = ""; grow(); }
    toBottom();
  } catch (e) { trouble(e); }
  sending = false; $("send").disabled = false;
}

async function undo(item) {
  if (!who) return say("Touch your name at the top first.");
  try { apply(await api.undo(chat.id, item.seq, who)); }
  catch (e) { trouble(e); }
}

async function answer(item, yes) {
  if (!who) return say("Touch your name at the top first.");
  try { apply(await api.confirm(chat.id, item.seq, who, yes)); }
  catch (e) { trouble(e); }
}

// --- the menu and profiles -----------------------------------------------------------------------

function closeMenu() { $("menu").hidden = true; }
function drawMenu() {
  const m = $("menu");
  const item = (title, sub, onClick) => { const b = btn("", title, () => { closeMenu(); onClick(); }); if (sub) b.append(el("small", null, sub)); return b; };
  const list = [item("New chat", "Start fresh; Claude still remembers your profiles", () => { poll?.abort(); chat = null; drawThread(true); $("text").focus(); }),
    item("Taste profiles", "What Claude knows about each of you", profiles)];
  for (const c of chats.filter(c => !chat || c.id !== chat.id).slice(0, 5)) {
    list.push(item(new Date(c.updated * 1000).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }), c.first || "Earlier chat", () => open(c.id)));
  }
  if (!app) list.push(item("Shopping list", null, () => { location.href = "/shop/"; }));
  m.replaceChildren(...list);
}
$("more").addEventListener("click", e => { e.stopPropagation(); drawMenu(); $("menu").hidden = !$("menu").hidden; });
document.addEventListener("click", e => { if (!$("menu").contains(e.target)) closeMenu(); });

async function profiles() {
  let data;
  try { data = await api.profiles(); } catch (e) { return trouble(e); }
  const layer = $("layer"), full = el("div", "full"), head = el("header"), body = el("div", "scroll");
  const close = () => layer.replaceChildren();
  head.append(btn("back", "‹ Back", close), el("h2", null, "Taste profiles"));
  body.append(el("p", "hint", "Claude reads these at the start of every chat and adds to them when you tell it something lasting. Edit freely: one note per line."));
  const boxes = data.people.map(p => {
    const box = Object.assign(el("textarea"), { value: data.profiles[p.key] || "" });
    box.id = `profile-${p.key}`;
    const label = el("label", null, p.name); label.htmlFor = box.id;
    body.append(label, box);
    return [p.key, box];
  });
  body.append(btn("btn", "Save", async () => {
    try { for (const [key, box] of boxes) await api.saveProfile(key, box.value); say("Saved."); close(); }
    catch (e) { trouble(e); }
  }));
  full.append(head, body);
  layer.replaceChildren(full);
}

// --- composing -----------------------------------------------------------------------------------

function grow() { const t = $("text"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; }
$("text").addEventListener("input", grow);
$("text").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$("compose").addEventListener("submit", e => { e.preventDefault(); send(); });
// a phone that slept drops the long poll: pick it up again when the page shows
document.addEventListener("visibilitychange", () => { if (!document.hidden && chat) listen(); });

// --- start ---------------------------------------------------------------------------------------

async function start() {
  try {
    const home = await api.home();
    people = home.people; chats = home.chats || [];
    who = pickWho(store.get(WHO_KEY), people);
    drawWho();
    if (home.current) await open(home.current); else drawThread(true);
  } catch (e) { trouble(e); drawThread(true); }
}
drawThread(true);
start();
