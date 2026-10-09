// Menu fork: the Add recipe page. Share a link (Android's Share menu, the iPhone Shortcut, or paste
// it), pick Add now or Show me the preview first, and Claude imports it at home. Rules live in
// ../inbox.js; this file only draws and listens.

import { Draft, MODES, STAGES, active, appBridge, inboxApi, keyBytes, nextActions, pill, progress, recipeIdOf, sharedLink } from "../inbox.js";

const app = appBridge();   // the Menu app, when this page runs inside it
const api = inboxApi({ bridge: app });
// the app has its own shopping list; the phone page's needs the Tailscale address
if (app) document.querySelector('a.pill.link[href="/shop/"]')?.remove();
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", e => { e.stopPropagation(); onClick(e); }); return b; };
const bg = (node, src) => { if (src && /^https:\/\//.test(src)) node.style.backgroundImage = `url(${JSON.stringify(src)})`; return node; };
const ago = s => { const m = Math.round((Date.now() / 1000 - s) / 60); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(s * 1000).toLocaleDateString(); };

let jobs = [];
let share = null;          // {url}: the sheet asking Add now or Show me the preview first
let open = null;           // the job shown full screen: its server view
let editing = null;        // the part being commented on ("photo", "step 2", "assume 0", ...)
let otherFor = null;       // the question whose "Other…" box is open
let sending = false;
const drafts = new Map();  // job id -> Draft, kept while the page is open
const draftFor = id => { if (!drafts.has(id)) drafts.set(id, new Draft()); return drafts.get(id); };

let toastTimer = null;
function say(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
function trouble(e) {
  if (e.kind === "signin") {
    const n = $("note");
    if (app) n.replaceChildren("Tandoor did not accept the Menu app's sign-in. Sign out and in again in Settings.");
    else n.replaceChildren("Tandoor needs you to sign in first. ", Object.assign(el("a", null, "Sign in"), { href: "/accounts/login/?next=/shop/add/" }));
    n.hidden = false;
  } else say(e.kind === "offline" ? "No signal. Try again in a moment." : e.message);
}

// --- talking to home ---------------------------------------------------------------------------

let pollTimer = null;
async function refresh() {
  clearTimeout(pollTimer);
  try {
    jobs = (await api.jobs()).jobs;
    $("note").hidden = true;
    if (open) {
      const id = open.id, j = await api.job(id);
      if (open && open.id === id) open = j; // not if they went Back or opened another meanwhile
    }
  } catch (e) { trouble(e); }
  draw();
  const busy = jobs.some(active) || (open && active(open));
  pollTimer = setTimeout(refresh, busy ? 3000 : 20000);
}

async function start(mode) {
  const url = share.url;
  share = null;
  draw();
  try {
    const job = await api.add(url, mode);
    $("link").value = "";
    say(mode === "look" ? "Started. We'll let you know when the preview is ready." : "Started. We'll let you know if it needs you.");
    if (job.id) jobs = [job, ...jobs.filter(j => j.id !== job.id)];
  } catch (e) { trouble(e); }
  refresh();
}

async function send(action) {
  if (sending || !open) return;
  sending = true; draw();
  try {
    open = await api.reply(open.id, draftFor(open.id).body(action));
    drafts.delete(open.id);
    editing = null; otherFor = null;
    say(action === "revise" ? "Sent. Claude is making the changes." : action === "change" ? "Sent. Claude is changing it." : "Adding it now.");
  } catch (e) { trouble(e); }
  sending = false;
  refresh();
}

async function retry() {
  try { open = await api.retry(open.id); } catch (e) { trouble(e); }
  refresh();
}

// --- notifications -----------------------------------------------------------------------------

const canPush = () => "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await api.pushKey()) });
  await api.subscribe(sub.toJSON());
}
function bell() {
  const b = $("bell");
  b.hidden = !canPush() || Notification.permission !== "default";
  b.onclick = async () => {
    if (await Notification.requestPermission() === "granted") {
      try { await subscribe(); say("You'll get a notification when a recipe needs you."); } catch { say("Couldn't turn on notifications."); }
    }
    bell();
  };
}

// --- drawing -----------------------------------------------------------------------------------

function jobRow(j) {
  const p = pill(j);
  const info = el("div");
  info.append(el("p", "title", j.title || j.host), el("span", `tag ${p.kind}`, p.text));
  if (active(j)) { const bar = el("div", "bar"), i = el("i"); i.style.width = `${Math.round(progress(j) * 100)}%`; bar.append(i); info.append(bar); }
  info.append(el("span", "meta", `${j.by} · ${ago(j.created)}`));
  const row = el("div", "job");
  row.append(bg(el("div", "thumb"), j.image), info);
  row.addEventListener("click", async () => {
    open = j; editing = null; otherFor = null; draw(); // the row's summary at once, the full view when it comes
    try { const full = await api.job(j.id); if (open && open.id === j.id) { open = full; draw(); } } catch (e) { trouble(e); }
  });
  return row;
}

function drawList() {
  const box = $("jobs");
  box.replaceChildren(...(jobs.length ? jobs.map(jobRow) : [el("p", "empty", "Share a recipe from any app, or paste a link above.")]));
}

function sheet() {
  const shade = el("div", "shade");
  shade.addEventListener("click", e => { if (e.target === shade) { share = null; draw(); } });
  const s = el("div", "sharesheet");
  let host = share.url;
  try { host = new URL(share.url).hostname.replace(/^www\./, ""); } catch { /* shown as typed */ }
  s.append(el("div", "grip"), el("p", "title", host),
    btn("btn", MODES.now, () => start("now")), el("p", "why", "Asks only what it must, and tells you what it assumed"),
    btn("btn ghost", MODES.look, () => start("look")), el("p", "why", "See the whole recipe, comment on any part, answer Claude's questions"),
    el("p", "why", "You can close this. We'll notify you when it needs you."));
  shade.append(s);
  return shade;
}

const canComment = j => (j.state === "ask" && j.preview) || j.state === "done";

// one part of the recipe: tap it to leave a note for Claude
function part(name, node, label) {
  const j = open, d = draftFor(j.id);
  const wrap = el("div", "part" + ((j.changed || []).includes(name) ? " changed" : ""));
  wrap.append(node);
  if ((j.changed || []).includes(name)) wrap.append(el("span", "upd", "updated"));
  if (!canComment(j)) return wrap;
  wrap.addEventListener("click", () => { editing = editing === name ? null : name; draw(); });
  if (d.comments[name] && editing !== name) {
    const mine = el("div", "mine");
    mine.append(el("span", null, `Your note: ${d.comments[name]}`), btn("", "✕", () => { d.comment(name, ""); draw(); }));
    wrap.append(mine);
  }
  if (editing === name) wrap.append(noteBox(`What should change in ${label}?`, d.comments[name] || "", text => { d.comment(name, text); editing = null; draw(); }));
  return wrap;
}

function noteBox(placeholder, value, save) {
  const box = el("div", "say"), input = el("input");
  Object.assign(input, { placeholder, value, enterKeyHint: "done" });
  input.addEventListener("click", e => e.stopPropagation());
  const done = () => { const v = input.value; settle(); save(v); };
  input.addEventListener("keydown", e => { if (e.key === "Enter") done(); });
  box.append(input, btn("btn", "Save", done));
  setTimeout(() => input.focus(), 0);
  return box;
}

function preview(r) {
  const out = [];
  out.push(part("photo", bg(el("div", "photo"), r.image), "the photo"), el("h2", null, r.name));
  const meta = [r.servings, r.times].filter(Boolean).join(" · ");
  if (meta) out.push(el("span", "meta", meta));
  if (r.description) out.push(part("description", el("div", "desc", r.description), "the description"));
  const ings = el("div", "ings");
  for (const i of r.ingredients) {
    const row = el("div", "ing");
    const name = el("span", null, i.food);
    if (i.note) name.append(el("small", null, ` · ${i.note}`));
    row.append(el("b", null, [i.amount, i.unit].filter(Boolean).join(" ")), name);
    ings.append(row);
  }
  const sec = (t, hint) => { const s = el("div", "sec"); s.append(el("span", null, t), el("span", null, hint)); return s; };
  out.push(sec("Ingredients", `${r.ingredients.length}`), part("ingredients", ings, "the ingredients"));
  out.push(sec("Steps", canComment(open) ? "tap any part to comment" : ""));
  for (const s of r.steps) {
    const row = el("div", "step"), text = el("span");
    if (s.name) text.append(el("em", null, s.name));
    text.append(s.text);
    row.append(el("b", null, String(s.n)), text);
    out.push(part(`step ${s.n}`, row, `step ${s.n}`));
  }
  return out;
}

function question(q, d, total) {
  const box = [];
  const i = d.answered(open.questions) + 1;
  box.push(el("p", "from", `${q.kind === "claude" ? "Claude asks · " : ""}Question ${i} of ${total}`), el("p", "q", q.text));
  if (q.why) box.push(el("p", "from", q.why));
  const opts = el("div", "opts");
  const pick = v => { settle(); d.answer(q.id, v); otherFor = null; if (!open.preview && !d.next(open.questions)) send("add"); else draw(); };
  q.options.forEach((o, n) => opts.append(btn("opt" + (n === (q.suggested ?? 0) ? " rec" : ""), o, () => pick(o))));
  opts.append(btn("opt", "Other…", () => { otherFor = q.id; draw(); }));
  box.push(opts);
  if (otherFor === q.id) {
    const row = el("div", "other"), input = el("input");
    input.placeholder = "Your answer";
    input.addEventListener("keydown", e => { if (e.key === "Enter" && input.value.trim()) pick(input.value.trim()); });
    row.append(input, btn("btn", "OK", () => input.value.trim() && pick(input.value.trim())));
    box.push(row);
    setTimeout(() => input.focus(), 0);
  }
  return box;
}

function dock() {
  const j = open, d = draftFor(j.id), box = el("div", "dock");
  if (active(j)) {
    const bar = el("div", "bar"), i = el("i"); i.style.width = `${Math.round(progress(j) * 100)}%`; bar.append(i);
    box.append(el("p", null, j.state === "queued" ? "Waiting its turn…" : `${STAGES[j.stage] || "Starting"}…`), bar,
      el("p", "from", "You can close this. We'll notify you when it needs you."));
    return box;
  }
  if (j.state === "failed") {
    box.append(el("p", "bad", j.error || "It stopped."), btn("btn", "Try again", retry));
    return box;
  }
  if (j.message) box.append(el("p", "claude", j.message));
  if (j.state === "done") {
    const line = el("p", "done", "✓ Added · ");
    if (j.link) {
      const a = Object.assign(el("a", null, "Open recipe"), { href: j.link, target: "_blank", rel: "noopener" });
      const id = recipeIdOf(j.link);
      if (app && id != null) a.addEventListener("click", e => { e.preventDefault(); app.openRecipe(id); });
      line.append(a);
    }
    box.append(line);
    (j.assumptions || []).forEach((a, n) => {
      const key = `assume ${n}`, row = el("div", "assume");
      row.append(el("span", null, d.comments[key] ? `${a} → ${d.comments[key].replace(/^Change ".*?" to: /, "")}` : a),
        btn("opt", "Change", () => { editing = editing === key ? null : key; draw(); }));
      box.append(row);
      if (editing === key) box.append(noteBox("What should it be?", "", text => { d.comment(key, text && `Change "${a}" to: ${text}`); editing = null; draw(); }));
    });
  } else {
    if (!Array.isArray(j.questions)) { box.append(el("p", "from", "Loading…")); return box; }
    const q = d.next(j.questions);
    if (q) { box.append(...question(q, d, j.questions.length)); return box; }
  }
  const n = Object.keys(d.comments).length;
  if (n) box.append(el("p", "from", n === 1 ? "1 note for Claude" : `${n} notes for Claude`));
  else if (j.state === "done") box.append(el("p", "from", "Tap any part of the recipe to change it."));
  const acts = nextActions(j, d);
  if (acts.length) {
    const row = el("div", acts.length > 1 ? "row2" : "");
    for (const a of acts) { const b = btn("btn" + (a.quiet ? " quiet" : ""), sending ? "Sending…" : a.label, () => send(a.action)); b.disabled = sending; row.append(b); }
    box.append(row);
  }
  return box;
}

function full() {
  const f = el("div", "full"), scroll = el("div", "scroll");
  scroll.dataset.job = open.id;
  f.append(btn("back", "‹ Back", () => { open = null; editing = null; draw(); }));
  if (open.recipe) scroll.append(...preview(open.recipe));
  else scroll.append(el("h2", null, open.title || open.host), el("p", "hint", open.state === "ask" ? "" : "The recipe shows here once Claude has written it."));
  f.append(scroll, dock());
  return f;
}

// a box being typed in keeps focus, so leave it before redrawing what it changed
const settle = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); };

let drawn = ""; // what the layer last showed: a poll that brings nothing new leaves it alone

function draw() {
  drawList();
  // keep a half-typed note or answer: a poll doesn't redraw over a focused box
  if (document.activeElement && document.activeElement.tagName === "INPUT" && $("layer").contains(document.activeElement)) return;
  const d = open && draftFor(open.id);
  const key = JSON.stringify([open, share, editing, otherFor, sending, d && d.answers, d && d.comments]);
  if (key === drawn) return;
  drawn = key;
  // a redraw keeps the reader's place in the recipe
  const old = $("layer").querySelector(".scroll"), top = old ? old.scrollTop : 0, same = old && open && old.dataset.job === open.id;
  const layer = [];
  if (open) layer.push(full());
  if (share) layer.push(sheet());
  $("layer").replaceChildren(...layer);
  const now = $("layer").querySelector(".scroll");
  if (now && same) now.scrollTop = top;
}

// --- start -------------------------------------------------------------------------------------

$("paste").addEventListener("submit", e => {
  e.preventDefault();
  const url = sharedLink(new URLSearchParams({ text: $("link").value }));
  if (url) { share = { url }; draw(); } else say("That doesn't look like a link.");
});

const params = new URLSearchParams(location.search);
const shared = sharedLink(params);
if (shared) share = { url: shared };
const jobId = params.get("job");
if (shared || jobId) history.replaceState(null, "", "/shop/add/");
if (jobId) api.job(jobId).then(j => { open = j; draw(); }).catch(trouble);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/shop/sw.js", { scope: "/shop/", updateViaCache: "none" }).catch(() => {});
bell();
if (canPush() && Notification.permission === "granted") subscribe().catch(() => {});
draw();
refresh();
