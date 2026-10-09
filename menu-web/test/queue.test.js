import assert from "node:assert/strict";
import { test } from "node:test";
import { AddQueue, GIVE_UP_AFTER, isWaiting } from "../public/queue.js";
import { cats, tandoorUnits } from "./fixtures.js";

class MemoryStore {
  constructor(items = null) { this.items = items; }
  load() { return this.items && JSON.parse(JSON.stringify(this.items)); }
  save(items) { this.items = JSON.parse(JSON.stringify(items)); return true; }
}

/** Tandoor as far as adding goes; `fail` makes every call throw with that kind, `failOnce` just the next. */
function fakeApi() {
  const calls = [];
  let id = 900;
  const api = {
    calls, fail: null, failOnce: null,
    async gate(name, ...args) {
      calls.push([name, ...args]);
      const f = api.failOnce ?? api.fail;
      api.failOnce = null;
      if (f) throw Object.assign(new Error(String(f.kind ?? f)), typeof f === "string" ? { kind: f } : f);
    },
    async addFood(name, category) { await api.gate("addFood", name); return { id: id++, name, supermarket_category: category }; },
    async addCategory(name) { await api.gate("addCategory", name); return { id: id++, name }; },
    async addEntry(e) { await api.gate("addEntry", e.food.name, e.amount); return { id: id++ }; },
    async setChecked(ids, checked) { await api.gate("setChecked", ids, checked); },
  };
  return api;
}

const LB = tandoorUnits.find(u => u.name === "lb");
const G = tandoorUnits.find(u => u.name === "g");
const eggs = { id: 5, name: "Egg", plural_name: "Eggs", supermarket_category: cats.dairy };
const catalog = { units: tandoorUnits, categories: Object.values(cats), foods: [eggs] };
const sendWith = (q, api, entries = []) => q.send(api, { entries: () => entries, catalog: () => catalog });

test("waiting adds draw as entries: a known food joins its row, a new one sits in its aisle or Other", () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12, unit: null });
  q.push({ food: { name: "Foil", aisle: null }, amount: null, unit: null });
  q.push({ food: { name: "Chicken, drumstick", aisle: cats.meat }, amount: 2, unit: LB });
  const [a, b, c] = q.asEntries(tandoorUnits);
  assert.deepEqual([a.food.id, a.amount, a.unit, a.waiting], [5, 12, null, true]);
  assert.deepEqual([b.food.id, b.food.supermarket_category, b.amount], ["new:foil", null, 0]);
  assert.deepEqual([c.food.supermarket_category.name, c.amount, c.unit], ["Meat", 907.2, G]);
  assert.ok([a, b, c].every(e => isWaiting(e.id)));
});

test("they survive a reload, and new ones don't reuse an old id", () => {
  const store = new MemoryStore();
  const q = new AddQueue({ store });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: eggs, amount: 6 });
  q.remove(["q1"]);
  const again = new AddQueue({ store });
  again.load();
  again.push({ food: eggs, amount: 1 });
  assert.deepEqual(again.items.map(i => [i.qid, i.amount]), [[2, 6], [3, 1]]);
});

test("sent in the order typed, each one leaving the queue as it goes", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: { name: "Foil", aisle: cats.household }, amount: null });
  const api = fakeApi();
  const got = await sendWith(q, api);
  assert.deepEqual(got, { sent: 2, dropped: [], stopped: null });
  assert.deepEqual(api.calls, [["addEntry", "Egg", 12], ["addFood", "Foil"], ["addEntry", "Foil", 0]]);
  assert.equal(q.length, 0);
});

test("a ticked waiting add was already bought: it's dropped, not sent", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.set(["q1"], true);
  const api = fakeApi();
  assert.deepEqual(await sendWith(q, api), { sent: 0, dropped: [], stopped: null });
  assert.deepEqual(api.calls, []);
  assert.equal(q.length, 0);
});

test("no signal stops the send and keeps the rest in order", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: eggs, amount: 6 });
  const api = fakeApi();
  api.fail = "offline";
  assert.deepEqual(await sendWith(q, api), { sent: 0, dropped: [], stopped: "offline" });
  assert.deepEqual(q.items.map(i => i.amount), [12, 6]);
});

test("one Tandoor refuses (4xx) is dropped and named; the rest still go", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: eggs, amount: 6 });
  const api = fakeApi();
  api.failOnce = { kind: "error", status: 400 };
  assert.deepEqual(await sendWith(q, api), { sent: 1, dropped: ["Egg"], stopped: null });
});

test("Tandoor down (5xx) keeps the add for later, and gives up after GIVE_UP_AFTER tries", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  const api = fakeApi();
  api.fail = { kind: "error", status: 502 };
  for (let n = 1; n < GIVE_UP_AFTER; n++) assert.deepEqual(await sendWith(q, api), { sent: 0, dropped: [], stopped: "error" });
  assert.equal(q.length, 1);
  assert.deepEqual(await sendWith(q, api), { sent: 0, dropped: ["Egg"], stopped: null });
  assert.equal(q.length, 0);
});

test("an add removed while another is being sent: the right ones go, none is lost", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: eggs, amount: 6 });
  q.push({ food: eggs, amount: 3 });
  const api = fakeApi();
  const realAdd = api.addEntry;
  api.addEntry = async e => { if (e.amount === 12) q.remove(["q2"]); return realAdd(e); };
  await sendWith(q, api);
  assert.deepEqual(api.calls.map(c => c[2]), [12, 3]);
  assert.equal(q.length, 0);
});

test("a held-back add (swiped, waiting out Undo) isn't sent; the next one is", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12 });
  q.push({ food: eggs, amount: 6 });
  const api = fakeApi();
  await q.send(api, { entries: () => [], catalog: () => catalog, skip: id => id === "q1" });
  assert.deepEqual(api.calls.map(c => c[2]), [6]);
  assert.deepEqual(q.items.map(i => i.amount), [12]);
});

test("a try that timed out but reached Tandoor isn't sent again", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12, tried: true });
  const there = [{ id: 1, food: eggs, amount: 12, unit: null, checked: false, created_at: new Date().toISOString() }];
  const api = fakeApi();
  assert.deepEqual(await sendWith(q, api, there), { sent: 1, dropped: [], stopped: null });
  assert.deepEqual(api.calls, []);
});

test("an older entry of the same amount isn't mistaken for the timed-out try", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: eggs, amount: 12, tried: true });
  const old = [{ id: 1, food: eggs, amount: 12, unit: null, checked: false, created_at: "2026-01-01T00:00:00Z" }];
  const api = fakeApi();
  await sendWith(q, api, old);
  assert.deepEqual(api.calls, [["addEntry", "Egg", 12]]);
});

test("a new food found in the catalog is kept on the add, so a stopped send doesn't make it later", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: { name: "egg", aisle: null }, amount: 2 });
  const api = fakeApi();
  api.fail = "offline";
  await sendWith(q, api);
  assert.equal(q.items[0].food.id, 5);
});

test("a new food in a new aisle draws in that aisle", () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: { name: "Dog food", aisle: " Pet " }, amount: null });
  assert.equal(q.asEntries(tandoorUnits)[0].food.supermarket_category.name, "Pet");
});

test("a new food is made once, even when two waiting adds name it and the first entry fails", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: { name: "Foil", aisle: cats.household }, amount: 1 });
  q.push({ food: { name: "foil", aisle: cats.household }, amount: 2 });
  const api = fakeApi();
  const realAdd = api.addEntry;
  let first = true;
  api.addEntry = async e => {
    if (!first) return realAdd(e);
    first = false;
    await api.gate("addEntry", e.food.name, e.amount);
    throw Object.assign(new Error("offline"), { kind: "offline" });
  };
  assert.equal((await sendWith(q, api)).stopped, "offline");
  await sendWith(q, api);
  assert.deepEqual(api.calls.filter(c => c[0] === "addFood"), [["addFood", "Foil"]]);
  assert.equal(api.calls.filter(c => c[0] === "addEntry").length, 3);
});

test("a waiting new food that Tandoor has since learned (typed on the tablet) isn't made twice", async () => {
  const q = new AddQueue({ store: new MemoryStore() });
  q.push({ food: { name: "egg", aisle: null }, amount: 2 });
  const api = fakeApi();
  await sendWith(q, api);
  assert.deepEqual(api.calls, [["addEntry", "Egg", 2]]);
});
