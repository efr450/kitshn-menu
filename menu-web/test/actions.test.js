import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, setRowAmount } from "../public/actions.js";
import { EDIT_LIST, plan } from "../public/edit.js";
import { aisles, cats, entry, milk, tandoorUnits } from "./fixtures.js";

/** Records every call; answers like Tandoor (new things get ids). */
function fakeApi() {
  const calls = [];
  let id = 900;
  const rec = (name, answer) => async (...args) => { calls.push([name, ...args]); return answer?.(...args); };
  return {
    calls,
    addCategory: rec("addCategory", name => ({ id: id++, name, description: null })),
    addFood: rec("addFood", (name, category) => ({ id: id++, name, supermarket_category: category })),
    addEntry: rec("addEntry", () => ({ id: id++ })),
    setChecked: rec("setChecked"),
    setAmount: rec("setAmount"),
    removeEntry: rec("removeEntry"),
    addEditList: rec("addEditList", name => ({ id: 77, name })),
    removeEditList: rec("removeEditList"),
  };
}
const catalog = { units: tandoorUnits, categories: Object.values(cats), foods: [] };
const G = tandoorUnits.find(u => u.name === "g");
const LB = tandoorUnits.find(u => u.name === "lb");
const CAN = tandoorUnits.find(u => u.name === "can");
const thigh = { id: 512, name: "Chicken, thigh" };

test("a known food is added with its amount; weights become grams", async () => {
  const api = fakeApi();
  assert.equal(await addItem(api, { food: thigh, amount: 2, unit: LB, entries: [], catalog }), "added");
  assert.deepEqual(api.calls, [["addEntry", { food: thigh, amount: 907.2, unit: G }]]);
});

test("other units stay as typed; no amount is added as 'some'", async () => {
  const api = fakeApi();
  await addItem(api, { food: { id: 1, name: "Beans, black" }, amount: 2, unit: CAN, entries: [], catalog });
  await addItem(api, { food: { id: 2, name: "Cilantro" }, amount: null, unit: null, entries: [], catalog });
  await addItem(api, { food: { id: 3, name: "Avocado" }, amount: 3, unit: null, entries: [], catalog });
  assert.deepEqual(api.calls, [
    ["addEntry", { food: { id: 1, name: "Beans, black" }, amount: 2, unit: CAN }],
    ["addEntry", { food: { id: 2, name: "Cilantro" }, amount: 0 }],
    ["addEntry", { food: { id: 3, name: "Avocado" }, amount: 3, unit: null }],
  ]);
});

test("a food already on the list: no amount leaves it (or unticks it); an amount adds to it", async () => {
  const api = fakeApi();
  const open = [entry("Cilantro", 1, null, { foodId: 2 })];
  const ticked = [entry("Cilantro", 1, null, { foodId: 2, checked: true }), entry("Cilantro", 2, null, { foodId: 2, checked: true })];
  assert.equal(await addItem(api, { food: { id: 2, name: "Cilantro" }, amount: null, entries: open, catalog }), "already");
  assert.equal(await addItem(api, { food: { id: 2, name: "Cilantro" }, amount: null, entries: ticked, catalog }), "unticked");
  assert.equal(await addItem(api, { food: { id: 2, name: "Cilantro" }, amount: 2, unit: null, entries: open, catalog }), "added");
  assert.deepEqual(api.calls.map(c => c[0]), ["setChecked", "addEntry"]);
  assert.deepEqual(api.calls[0], ["setChecked", ticked.map(e => e.id), false]);
});

test("a new food is made in its aisle first; a typed aisle name is reused or made", async () => {
  const api = fakeApi();
  await addItem(api, { food: { name: "Chicken, drumstick", aisle: cats.meat }, amount: null, entries: [], catalog });
  await addItem(api, { food: { name: "Paper napkins", aisle: "household" }, amount: null, entries: [], catalog });
  await addItem(api, { food: { name: "Dog food", aisle: " Pet " }, amount: null, entries: [], catalog });
  assert.deepEqual(api.calls.map(c => c.slice(0, 3)), [
    ["addFood", "Chicken, drumstick", cats.meat], ["addEntry", { food: { id: 900, name: "Chicken, drumstick", supermarket_category: cats.meat }, amount: 0 }],
    ["addFood", "Paper napkins", cats.household], ["addEntry", { food: { id: 902, name: "Paper napkins", supermarket_category: cats.household }, amount: 0 }],
    ["addCategory", "Pet"], ["addFood", "Dog food", { id: 904, name: "Pet", description: null }],
    ["addEntry", { food: { id: 905, name: "Dog food", supermarket_category: { id: 904, name: "Pet", description: null } }, amount: 0 }],
  ]);
});

const recipe = { list_recipe: 40, list_recipe_data: { id: 40, name: "Soup", recipe: 12 } };
const edits = { list_recipe: 77, list_recipe_data: { id: 77, name: EDIT_LIST, recipe: null } };
const milkEntries = (...rows) => rows.map(([a, extra, checked = false]) =>
  Object.assign(entry("Milk, whole", a, G, { category: aisles.DAIRY, foodId: 54, checked }), extra));

test("the first change makes the change group, then files a grams entry in it", async () => {
  const api = fakeApi();
  const entries = milkEntries([900, recipe]);
  await setRowAmount(api, { plan: plan(entries, milk, tandoorUnits), target: 2, all: entries, food: entries[0].food, done: false });
  assert.deepEqual(api.calls, [
    ["addEditList", EDIT_LIST],
    ["addEntry", { food: entries[0].food, amount: 3084, unit: G, listRecipe: 77 }],
  ]);
});

test("a change on a ticked row is made, then ticked, so Tandoor keeps listing it", async () => {
  const api = fakeApi();
  const entries = milkEntries([900, recipe, true]);
  await setRowAmount(api, { plan: plan(entries, milk, tandoorUnits), target: 2, all: entries, food: entries[0].food, done: true });
  assert.deepEqual(api.calls.map(c => c[0]), ["addEditList", "addEntry", "setChecked"]);
  assert.deepEqual(api.calls[2], ["setChecked", [900], true]);
});

test("every food's changes share the one group, found anywhere on the list", async () => {
  const api = fakeApi();
  const other = Object.assign(entry("Beef, ground", 100, G, { foodId: 9 }), edits);
  const entries = milkEntries([900, recipe]);
  await setRowAmount(api, { plan: plan(entries, milk, tandoorUnits), target: 2, all: [...entries, other], food: entries[0].food, done: false });
  assert.deepEqual(api.calls, [["addEntry", { food: entries[0].food, amount: 3084, unit: G, listRecipe: 77 }]]);
});

test("later changes move the entry (saying whether it's ticked); Reset of the last change deletes the group", async () => {
  const api = fakeApi();
  const entries = milkEntries([900, recipe], [3084, edits]);
  const p = plan(entries, milk, tandoorUnits);
  await setRowAmount(api, { plan: p, target: 3, all: entries, food: entries[0].food, done: false });
  await setRowAmount(api, { plan: p, target: p.was, all: entries, food: entries[0].food, done: false });
  assert.deepEqual(api.calls, [["setAmount", entries[1].id, 5076, false], ["removeEditList", 77]]);
});

test("Reset while other foods still have changes deletes just this one", async () => {
  const api = fakeApi();
  const other = Object.assign(entry("Beef, ground", 100, G, { foodId: 9 }), edits);
  const entries = milkEntries([900, recipe], [3084, edits]);
  const p = plan(entries, milk, tandoorUnits);
  await setRowAmount(api, { plan: p, target: p.was, all: [...entries, other], food: entries[0].food, done: false });
  assert.deepEqual(api.calls, [["removeEntry", entries[1].id]]);
});

test("a change in another unit replaces the old one, filed in the existing group", async () => {
  const api = fakeApi();
  const entries = [entry("Garlic", 0, null, { foodId: 8 }), Object.assign(entry("Garlic", 2, null, { foodId: 8 }), edits)];
  const p = { ...plan(entries, {}, tandoorUnits), kind: "add" }; // as if picking a unit chip again
  await setRowAmount(api, { plan: p, target: 1, unit: CAN, all: entries, food: entries[0].food, done: true });
  assert.deepEqual(api.calls, [
    ["removeEntry", entries[1].id],
    ["addEntry", { food: entries[0].food, amount: 1, unit: CAN, listRecipe: 77 }],
    ["setChecked", [900], true],
  ]);
});
