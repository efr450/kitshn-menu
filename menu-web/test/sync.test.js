import assert from "node:assert/strict";
import { test } from "node:test";
import { GIVE_UP_AFTER, ShopSync, syncLabel } from "../public/sync.js";

/** An in-memory Tandoor: entries by id; calls can be held open or failed to stage races. */
class FakeTandoor {
  constructor(entries) {
    this.rows = new Map(entries.map(e => [e.id, { ...e }]));
    this.fail = null;      // "offline" | "signin" | null
    this.calls = [];
    this.holds = [];       // resolvers for held calls, in order
    this.hold = false;
  }
  async gate(name) {
    this.calls.push(name);
    if (this.fail) throw Object.assign(new Error(this.fail), { kind: this.fail });
    if (this.hold) await new Promise(res => this.holds.push(res));
  }
  async listEntries() {
    const snapshot = [...this.rows.values()].map(e => ({ ...e }));  // what the server had when asked
    await this.gate("list");
    return snapshot;
  }
  async loadCatalog() {
    await this.gate("catalog");
    return { packages: { "milk, whole": { name: "half-gallon", pluralName: null, grams: 1992 } }, units: [{ id: 13, name: "g" }], foods: [], categories: [] };
  }
  async setChecked(ids, checked) {
    await this.gate(`set ${ids.join(",")}=${checked}`);
    for (const id of ids) if (this.rows.has(id)) this.rows.get(id).checked = checked;
  }
  release() { this.holds.shift()(); }
}

class MemoryStore {
  constructor(state = null) { this.state = state; }
  load() { return this.state && JSON.parse(JSON.stringify(this.state)); }
  save(s) { this.state = JSON.parse(JSON.stringify(s)); }
}

const rows = () => [{ id: 1, checked: false }, { id: 2, checked: false }, { id: 3, checked: false }];
const checkedOf = s => Object.fromEntries(s.view().map(e => [e.id, e.checked]));
const tick = () => new Promise(res => setImmediate(res));

test("a tick shows at once, reaches Tandoor, and the next refresh agrees", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  const sent = s.set([1, 2], true);
  assert.deepEqual(checkedOf(s), { 1: true, 2: true, 3: false });
  await sent;
  assert.deepEqual(t.calls.at(-1), "set 1,2=true");
  await s.refresh();
  assert.equal(s.pending.size, 0);
  assert.deepEqual(checkedOf(s), { 1: true, 2: true, 3: false });
});

test("offline ticks queue, survive closing the page, and send on the next start", async () => {
  const t = new FakeTandoor(rows());
  const store = new MemoryStore();
  const s = new ShopSync({ api: t, store });
  await s.refresh();
  t.fail = "offline";
  await s.set([1], true);
  await s.set([2], true);
  assert.equal(s.problem, "offline");
  assert.equal(s.waiting(), 2);
  assert.equal(t.rows.get(1).checked, false);

  // page closed and reopened, still offline: the saved list and the ticks are both there
  const again = new ShopSync({ api: t, store });
  again.load();
  assert.deepEqual(checkedOf(again), { 1: true, 2: true, 3: false });
  await again.refresh();
  assert.deepEqual(checkedOf(again), { 1: true, 2: true, 3: false });

  t.fail = null;
  await again.flush();
  assert.equal(again.waiting(), 0);
  assert.equal(t.rows.get(1).checked, true);
  assert.equal(t.rows.get(2).checked, true);
  assert.equal(again.problem, null);
});

test("a refresh that started before Tandoor accepted the tick can't undo it on screen", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.hold = true;
  const stale = s.refresh();             // Tandoor still says unchecked
  await tick();
  t.hold = false;
  await s.set([1], true);                // accepted while that fetch is in flight
  t.release();
  await stale;
  assert.equal(checkedOf(s)[1], true, "the old fetch is still overruled");
  await s.refresh();                     // a fetch started after the ack
  assert.equal(s.pending.size, 0);
  assert.equal(checkedOf(s)[1], true);
});

test("tick then untick before sending ends unchecked on Tandoor", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.fail = "offline";
  await s.set([1], true);
  await s.set([1], false);
  t.fail = null;
  await s.flush();
  assert.equal(t.rows.get(1).checked, false);
  // the offline attempts failed before reaching Tandoor; only the last value is sent once back
  assert.deepEqual(t.calls.filter(c => c.startsWith("set")).at(-1), "set 1=false");
  assert.equal(s.waiting(), 0);
});

test("an untick made while a tick is in flight is sent after it", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.hold = true;
  const first = s.set([1], true);
  await tick();
  s.set([1], false);                     // queued behind the in-flight request
  t.hold = false;
  t.release();
  await first;
  assert.equal(t.rows.get(1).checked, false);
  assert.equal(s.waiting(), 0);
});

test("someone else's change shows on refresh", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.rows.get(3).checked = true;          // ticked on the tablet
  t.rows.set(4, { id: 4, checked: false });
  await s.refresh();
  assert.deepEqual(checkedOf(s), { 1: false, 2: false, 3: true, 4: false });
});

test("a ticked entry deleted elsewhere is forgotten once sent", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  await s.set([2], true);
  t.rows.delete(2);
  await s.refresh();
  assert.equal(s.pending.size, 0);
  assert.deepEqual(Object.keys(checkedOf(s)), ["1", "3"]);
});

test("a failed refresh keeps the saved list and says why", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh({ catalog: true });
  assert.ok(s.packages["milk, whole"]);
  assert.equal(s.catalog.units[0].name, "g");
  t.fail = "signin";
  await s.refresh({ catalog: true });
  assert.equal(s.problem, "signin");
  assert.equal(s.view().length, 3);
  assert.ok(s.packages["milk, whole"]);
});

test("the pill says what's happening", () => {
  const at = o => syncLabel({ problem: null, sending: false, waiting: 0, left: 9, fresh: true, ...o });
  assert.deepEqual(at({}), { text: "Synced · 9 left", tone: "ok" });
  assert.deepEqual(at({ fresh: false }), { text: "Saved list · checking…", tone: "busy" });
  assert.deepEqual(at({ sending: true, waiting: 1 }), { text: "Sending…", tone: "busy" });
  assert.deepEqual(at({ problem: "offline", waiting: 2 }), { text: "Offline · 2 to send", tone: "off" });
  assert.deepEqual(at({ problem: "offline" }), { text: "Offline · saved list", tone: "off" });
  assert.deepEqual(at({ problem: "signin" }), { text: "Sign in", tone: "off" });
  assert.deepEqual(at({ problem: "dropped" }), { text: "Some ticks didn't save", tone: "off" });
  assert.equal(at({ problem: "error", waiting: 1 }).text, "Can't sync · 1 to send");
});

test("the saved list isn't called synced until a refresh this visit", async () => {
  const t = new FakeTandoor(rows());
  const store = new MemoryStore();
  await new ShopSync({ api: t, store }).refresh();
  const again = new ShopSync({ api: t, store });
  again.load();
  assert.equal(again.fresh, false);
  await again.refresh();
  assert.equal(again.fresh, true);
});

test("a tick Tandoor accepted isn't re-sent after a reload, so the tablet's later change stands", async () => {
  const t = new FakeTandoor(rows());
  const store = new MemoryStore();
  const s = new ShopSync({ api: t, store });
  await s.refresh();
  await s.set([1], true);                // accepted, but no refresh confirmed it before the page closed
  t.rows.get(1).checked = false;         // unticked on the tablet afterwards

  const again = new ShopSync({ api: t, store });
  again.load();
  assert.equal(again.waiting(), 0);
  const before = t.calls.length;
  await again.flush();
  assert.equal(t.calls.length, before, "nothing re-sent");
  await again.refresh();
  assert.equal(checkedOf(again)[1], false);
  assert.equal(again.pending.size, 0);
});

test("an older refresh answering after a newer one is dropped", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  t.hold = true;
  const older = s.refresh();             // sees everything unchecked
  await tick();
  t.hold = false;
  t.rows.get(3).checked = true;          // ticked on the tablet
  await s.refresh();
  t.release();
  await older;
  assert.equal(checkedOf(s)[3], true);
});

test("the catalog failing doesn't cost the list", async () => {
  const t = new FakeTandoor(rows());
  t.loadCatalog = async () => { throw Object.assign(new Error("bad row"), { kind: "error" }); };
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  assert.equal(await s.refresh({ catalog: true }), false);
  assert.equal(s.view().length, 3);
  assert.equal(s.problem, null);
});

test("ticks Tandoor keeps refusing are dropped after a few tries, and said so", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.fail = "error";
  await s.set([1], true);
  for (let i = 1; i < GIVE_UP_AFTER; i++) await s.flush();
  assert.equal(s.problem, "dropped");
  assert.equal(s.waiting(), 0);
  assert.equal(checkedOf(s)[1], false);
});

test("offline failures never drop ticks", async () => {
  const t = new FakeTandoor(rows());
  const s = new ShopSync({ api: t, store: new MemoryStore() });
  await s.refresh();
  t.fail = "offline";
  await s.set([1], true);
  for (let i = 0; i < GIVE_UP_AFTER * 2; i++) await s.flush();
  assert.equal(s.waiting(), 1);
});

test("a phone that won't store says so", async () => {
  const s = new ShopSync({ api: new FakeTandoor(rows()), store: { load: () => null, save: () => false } });
  await s.refresh();
  assert.equal(s.stored, false);
});
