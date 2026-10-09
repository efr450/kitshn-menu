import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount, foodRow, listSources, recipeAmounts, shoppingAisles, sourceOf } from "../public/list.js";
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

const group = (id, name, recipe, mp = null) => ({ list_recipe: id, list_recipe_data: { id, name: "", recipe, recipe_data: recipe ? { name } : null, meal_plan_data: mp } });
const chili = group(40, "Chili", 12, { from_date: "2026-10-13T18:00:00", meal_type_name: "Dinner" });
const tacos = group(41, "Beef tacos", 13);
const changed = { list_recipe: 77, list_recipe_data: { id: 77, name: "Changed by hand", recipe: null } };

test("a row lists each recipe that wants it, with that recipe's amount; changes and typed ones apart", () => {
  const e = [Object.assign(entry("Beef, ground", 450, G, { foodId: 7 }), chili), Object.assign(entry("Beef, ground", 230, G, { foodId: 7 }), tacos),
    Object.assign(entry("Beef, ground", 100, G, { foodId: 7 }), changed), entry("Beef, ground", 0, null, { foodId: 7 })];
  assert.deepEqual(foodRow(e, {}).sources.map(s => [s.name, s.when, s.text]), [
    ["Chili", "Tue Dinner", "450 g"], ["Beef tacos", "", "230 g"], ["Changed by hand", "", "100 g"], ["Added by hand", "", "some"]]);
});

test("a ticked entry still shows its recipe's amount in the breakdown", () => {
  const r = foodRow([Object.assign(entry("Salt", 5, G, { foodId: 3, checked: true }), chili)], {});
  assert.equal(r.sources[0].text, "5 g");
});

test("the recipe chips: one per recipe with foods left, typed-in ones last; changes aren't a source", () => {
  const got = listSources([
    entry("Foil", 1, null, { foodId: 1 }),
    Object.assign(entry("Beef, ground", 450, G, { foodId: 7 }), chili), Object.assign(entry("Onion", 1, null, { foodId: 8, checked: true }), chili),
    Object.assign(entry("Beef, ground", 230, G, { foodId: 7 }), tacos), Object.assign(entry("Beef, ground", 50, G, { foodId: 7 }), changed),
  ]);
  assert.deepEqual(got.map(s => [s.key, s.name, s.left]), [["r40", "Chili", 1], ["r41", "Beef tacos", 1], ["added", "Added by hand", 1]]);
});

test("a waiting add counts as typed in, and says it's waiting", () => {
  assert.deepEqual(sourceOf({ ...entry("Foil", 0), waiting: true }), { key: "added", name: "Added by hand", when: "waiting to send" });
});

test("the meal-plan day is Tandoor's, whatever the phone's timezone", () => {
  const late = group(42, "Soup", 14, { from_date: "2026-10-13T23:30:00-07:00", meal_type_name: "Dinner" });
  assert.equal(sourceOf(Object.assign(entry("Leek", 1), late)).when, "Tue Dinner");
});

test("a waiting add joins the typed-in line of its row", () => {
  const e = [entry("Egg", 6, null, { foodId: 5 }), { ...entry("Egg", 12, null, { foodId: 5 }), waiting: true }];
  assert.deepEqual(foodRow(e, {}).sources.map(s => [s.name, s.text]), [["Added by hand", "18"]]);
});
