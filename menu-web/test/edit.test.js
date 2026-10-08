import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIT_LIST, change, editListId, isChange, plan } from "../public/edit.js";
import { foodRow, shoppingAisles } from "../public/list.js";
import { aisles, entry, milk, tandoorUnits, units } from "./fixtures.js";

const { G, STALK } = units;
const LB = tandoorUnits.find(u => u.name === "lb");
const HALF_GALLON = tandoorUnits.find(u => u.name === "half-gallon");
const GRAMS = tandoorUnits.find(u => u.name === "g"); // the unit changes are written in
const recipe = { list_recipe: 40, list_recipe_data: { id: 40, name: "Soup", recipe: 12 } };
const edits = { list_recipe: 77, list_recipe_data: { id: 77, name: EDIT_LIST, recipe: null } };
const as = (e, extra) => Object.assign(e, extra);
const milkRow = (...amounts) => amounts.map(([a, extra]) => as(entry("Milk, whole", a, G, { category: aisles.DAIRY, foodId: 54 }), extra));

test("a change entry is one in the EDIT_LIST group with no recipe", () => {
  const [r, c] = milkRow([900, recipe], [500, edits]);
  assert.equal(isChange(r), false);
  assert.equal(isChange(c), true);
  assert.equal(isChange(as(entry("Milk, whole", 1, G), { list_recipe_data: { name: EDIT_LIST, recipe: 3 } })), false);
  assert.equal(editListId([r, c]), 77);
  assert.equal(editListId([r]), null);
});

test("a food with a package is changed in whole packages; the change is grams", () => {
  const rows = milkRow([900, recipe]);
  const p = plan(rows, milk, tandoorUnits);
  assert.equal(p.kind, "pack");
  assert.equal(p.value, 1);
  assert.equal(p.was, 1);
  assert.equal(p.step, 1);
  assert.deepEqual(change(p, 2), { remove: [], set: null, add: { amount: 2 * 1992 - 900, unit: GRAMS } });
});

test("changing again moves the one change entry; back to the original deletes it", () => {
  const rows = milkRow([900, recipe], [3084, edits]);
  const p = plan(rows, milk, tandoorUnits);
  assert.equal(p.value, 2);
  assert.equal(p.was, 1);
  const c = rows[1];
  assert.deepEqual(change(p, 3), { remove: [], set: { id: c.id, amount: 3 * 1992 - 900 }, add: null });
  assert.deepEqual(change(p, 1), { remove: [c.id], set: null, add: null });
});

test("several change entries collapse into one", () => {
  const rows = milkRow([900, recipe], [500, edits], [600, edits]);
  const p = plan(rows, milk, tandoorUnits);
  const [, a, b] = rows;
  assert.deepEqual(change(p, 2), { remove: [b.id], set: { id: a.id, amount: 2 * 1992 - 900 }, add: null });
});

test("by-weight aisles change in quarter pounds", () => {
  const rows = [as(entry("Beef, ground", 680, G, { category: aisles.MEAT, foodId: 9 }), recipe)];
  const p = plan(rows, {}, tandoorUnits);
  assert.equal(p.kind, "lb");
  assert.equal(p.value, 1.5);
  assert.equal(p.step, 0.25);
  assert.equal(change(p, 2).add.amount, Math.round((2 * 453.592 - 680) * 1000) / 1000);
});

test("other foods change in their one unit; grams step by 50", () => {
  const celery = [as(entry("Celery", 2, STALK, { category: aisles.PRODUCE }), recipe)];
  const p = plan(celery, {}, tandoorUnits);
  assert.deepEqual([p.kind, p.value, p.was, p.step], ["unit", 2, 2, 1]);
  assert.deepEqual(change(p, 3).add, { amount: 1, unit: STALK });
  const carrots = [as(entry("Carrots", 681, G, { category: aisles.PRODUCE }), recipe)];
  assert.equal(plan(carrots, {}, tandoorUnits).step, 50);
});

test("a row with no amount offers each, its package and pounds", () => {
  const garlic = [entry("Garlic", 0, null, { category: aisles.PRODUCE })];
  const p = plan(garlic, {}, tandoorUnits);
  assert.equal(p.kind, "add");
  assert.deepEqual(p.choices, [null]);
  assert.deepEqual(change(p, 3, null), { remove: [], set: null, add: { amount: 3, unit: null } });
  assert.deepEqual(change(p, 0, null), { remove: [], set: null, add: null });
  const steak = [entry("Steak", 0, null, { category: aisles.MEAT })];
  assert.deepEqual(plan(steak, {}, tandoorUnits).choices.map(u => u?.name ?? null), [null, "lb"]);
  const m = [entry("Milk, whole", 0, null, { category: aisles.DAIRY })];
  assert.deepEqual(plan(m, milk, tandoorUnits).choices.map(u => u?.name ?? null), [null, "half-gallon"]);
});

test("once an amount is added it changes like any other; Reset (back to none) deletes it", () => {
  const rows = [entry("Garlic", 0, null, { category: aisles.PRODUCE }), as(entry("Garlic", 2, null, { category: aisles.PRODUCE }), edits)];
  const p = plan(rows, {}, tandoorUnits);
  assert.deepEqual([p.kind, p.value, p.was], ["unit", 2, null]);
  assert.deepEqual(change(p, 0), { remove: [rows[1].id], set: null, add: null });
});

test("mixed units can't be changed here", () => {
  const rows = [entry("Celery", 2, STALK), entry("Celery", 100, { id: 30, name: "cup", plural_name: "cups", base_unit: "us_cup" })];
  const p = plan(rows, {}, tandoorUnits);
  assert.equal(p.kind, null);
  assert.deepEqual(change(p, 5), { remove: [], set: null, add: null });
});

test("only unticked entries count, until everything is ticked", () => {
  const rows = milkRow([900, recipe], [1992, { ...recipe, checked: true }]);
  rows[1].checked = true;
  assert.equal(plan(rows, milk, tandoorUnits).value, 1);
});

test("a package typed as its own unit counts toward packages", () => {
  const rows = [as(entry("Milk, whole", 1, HALF_GALLON, { category: aisles.DAIRY }), {})];
  const p = plan(rows, milk, tandoorUnits);
  assert.deepEqual([p.kind, p.value, p.origin], ["pack", 1, 1992]);
});

test("a changed row says so and what it was; its sub line keeps the recipe amount", () => {
  const plain = foodRow(milkRow([900, recipe]), milk);
  assert.deepEqual([plain.edited, plain.was, plain.sub], [false, null, "900 g in recipes"]);
  const changed = foodRow(milkRow([900, recipe], [3084, edits]), milk);
  assert.deepEqual([changed.edited, changed.was, changed.buy, changed.sub], [true, "1 half-gallon", "2 half-gallons", "900 g in recipes"]);
  const typed = foodRow([entry("Kombucha", 2), as(entry("Kombucha", 1), edits)], {});
  assert.deepEqual([typed.edited, typed.was, typed.amounts, typed.sub], [true, "2", "3", null]);
  const fromNothing = foodRow([as(entry("Garlic", 3), edits)], {});
  assert.equal(fromNothing.was, "no amount");
  const fromSome = foodRow([entry("Pickles", 0), as(entry("Pickles", 2), edits)], {});
  assert.deepEqual([fromSome.amounts, fromSome.was], ["2", "no amount"]);
  assert.equal(foodRow([as(entry("Milk, whole", 900, G, { category: aisles.DAIRY }), {})], milk).sub, "900 g on the list");
});

test("a row typed with LB stays editable in pounds", () => {
  const rows = [entry("Steak", 1, LB, { category: aisles.MEAT })];
  const p = plan(rows, {}, tandoorUnits);
  assert.deepEqual([p.kind, p.value], ["lb", 1]);
});

test("lowering shows: the buy amount drops, and nothing left says none", () => {
  const lb = foodRow([as(entry("Beef, ground", 500, G, { category: aisles.MEAT }), recipe), as(entry("Beef, ground", -46.4, G, { category: aisles.MEAT }), edits)], {});
  assert.equal(lb.buy, "1 lb");
  const none = foodRow(milkRow([900, recipe], [-900, edits]), milk);
  assert.deepEqual([none.buy, none.amounts, none.was], [null, "none", "1 half-gallon"]);
});

test("a change left behind when its recipe is taken off: a negative one disappears, a positive one stays", () => {
  const neg = [as(entry("Beef, ground", -46, G, { category: aisles.MEAT, foodId: 77 }), edits)];
  assert.equal(foodRow(neg, {}).gone, true);
  assert.deepEqual(shoppingAisles(neg, {}), []);
  const pos = [as(entry("Beef, ground", 453.6, G, { category: aisles.MEAT, foodId: 77 }), edits)];
  assert.equal(shoppingAisles(pos, {})[0].rows[0].buy, "1 lb");
});
