import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount, foodRow, recipeAmounts, shoppingAisles } from "../public/list.js";
import { aisles, entry, milk, units } from "./fixtures.js";

const { G, STALK } = units;

test("amounts: grams whole, others to two places", () => {
  assert.equal(formatAmount(453.3333, "g"), "453 g");
  assert.equal(formatAmount(1.3333, null), "1.33");
  assert.equal(formatAmount(2.5, "stalk"), "2.5 stalk");
  assert.equal(formatAmount(4, null), "4");
});

test("recipe amounts: one per unit, unchecked only until all are checked, 'some' for unmeasured", () => {
  const e = [entry("Celery", 2, STALK), entry("Celery", 100, G), entry("Celery", 1, STALK, { checked: true }), entry("Celery", 0)];
  assert.deepEqual(recipeAmounts(e).map(a => a.text), ["2 stalks", "100 g", "some"]);
  const done = [entry("Celery", 2, STALK, { checked: true }), entry("Celery", 1, STALK, { checked: true })];
  assert.deepEqual(recipeAmounts(done).map(a => a.text), ["3 stalks"]);
});

test("unit plural only above one, and only when the unit has one", () => {
  assert.deepEqual(recipeAmounts([entry("Celery", 1, STALK)]).map(a => a.text), ["1 stalk"]);
  assert.deepEqual(recipeAmounts([entry("Pecans", 2, { id: 30, name: "cup", plural_name: "" })]).map(a => a.text), ["2 cup"]);
});

test("a row carries the buy amount, every entry id, and done only when all are checked", () => {
  const e = [entry("Milk, whole", 600, G, { category: aisles.DAIRY }), entry("Milk, whole", 300, G, { category: aisles.DAIRY, checked: true })];
  const r = foodRow(e, milk);
  assert.equal(r.buy, "1 half-gallon");
  assert.equal(r.amounts, "600 g");
  assert.deepEqual(r.ids, e.map(x => x.id));
  assert.equal(r.done, false);
});

test("by-weight aisles get pounds; other rows no buy amount", () => {
  assert.equal(foodRow([entry("Beef, ground", 680, G, { category: aisles.MEAT })], {}).buy, "1½ lb");
  assert.equal(foodRow([entry("Carrots", 681, G, { category: aisles.PRODUCE })], {}).buy, null);
});

test("plural name when there's more than one", () => {
  assert.equal(foodRow([entry("Onion", 2, null, { plural: "Onions" })], {}).name, "Onions");
  assert.equal(foodRow([entry("Onion", 1, null, { plural: "Onions" })], {}).name, "Onion");
  assert.equal(foodRow([entry("Onion", 2, null, { plural: " " })], {}).name, "Onion");
});

test("aisles by name with Other last, foods by name, counts of what's left", () => {
  const got = shoppingAisles([
    entry("Salt", 0),
    entry("Milk, whole", 900, G, { category: aisles.DAIRY, checked: true }),
    entry("Carrots", 681, G, { category: aisles.PRODUCE }),
    entry("Beef, ground", 680, G, { category: aisles.MEAT }),
    entry("Apple", 2, null, { category: aisles.PRODUCE }),
  ], milk);
  assert.deepEqual(got.map(a => [a.name, a.rows.map(r => r.name), a.left]), [
    ["Dairy", ["Milk, whole"], 0], ["Meat", ["Beef, ground"], 1], ["Produce", ["Apple", "Carrots"], 2], ["Other", ["Salt"], 1],
  ]);
});

test("entries of one food become one row", () => {
  const got = shoppingAisles([entry("Beef, ground", 400, G, { category: aisles.MEAT, foodId: 7 }), entry("Beef, ground", 280, G, { category: aisles.MEAT, foodId: 7 })], {});
  assert.equal(got[0].rows.length, 1);
  assert.equal(got[0].rows[0].buy, "1½ lb");
});

test("an entry without a food is left out", () => {
  const got = shoppingAisles([{ id: 99, amount: 1, unit: null, checked: false, food: null }, entry("Salt", 0)], {});
  assert.deepEqual(got.flatMap(a => a.rows.map(r => r.name)), ["Salt"]);
});
