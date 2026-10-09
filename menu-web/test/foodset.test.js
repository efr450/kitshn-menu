import assert from "node:assert/strict";
import { test } from "node:test";
import { byWeightOf, weighsFrom } from "../public/buy.js";
import { applyRule, changes, packageProblem, parseSize, ruleOf, ruleProblem, saveFood, settingsOf, sizeText, withMarker } from "../public/foodset.js";
import { cats, tandoorUnits } from "./fixtures.js";

const milk = { id: 50, name: "Milk, whole", supermarket_category: cats.dairy, description: "" };
const beef = { id: 51, name: "Beef, ground", supermarket_category: cats.meat };
const brie = { id: 52, name: "Cheese, brie", supermarket_category: cats.dairy, description: "soft; by weight" };
const halfGallon = { "milk, whole": { name: "half-gallon", pluralName: "half-gallons", grams: 1992 } };

test("a food's own by weight / by count wins over its aisle", () => {
  const weighs = weighsFrom([brie, { ...beef, description: "by count" }, milk]);
  assert.deepEqual(weighs, { "cheese, brie": true, "beef, ground": false });
  assert.equal(byWeightOf(brie, weighs), true);
  assert.equal(byWeightOf(beef, weighs), false);
  assert.equal(byWeightOf(beef, {}), true);
  assert.equal(byWeightOf(milk, weighs), false);
});

test("the sheet starts from the food's package, else its weight rule, else counted", () => {
  assert.deepEqual(settingsOf(milk, halfGallon, {}), { aisle: cats.dairy, mode: "package", pkg: { name: "half-gallon", grams: 1992 }, ownRule: false });
  assert.equal(settingsOf(beef, {}, {}).mode, "weight");
  assert.deepEqual(settingsOf(brie, {}, { "cheese, brie": true }).ownRule, true);
  assert.equal(settingsOf({ id: 1, name: "Foil", supermarket_category: null }, {}, {}).aisle, null);
});

test("markers come and go without touching the rest of a description", () => {
  assert.equal(withMarker("", "by weight", true), "by weight");
  assert.equal(withMarker("soft", "by weight", true), "soft; by weight");
  assert.equal(withMarker("soft; By Weight", "by weight", true), "soft; By Weight");
  assert.equal(withMarker("soft; by weight", "by weight", false), "soft");
  assert.equal(withMarker(null, "by count", false), "");
  // only its own "; marker" part comes out; other text is left exactly as written
  assert.equal(withMarker("a;b", "by weight", false), "a;b");
  assert.equal(withMarker("sold by weight at the deli", "by weight", false), "sold by weight at the deli");
});

test("a food's rule reads from and writes into its description", () => {
  assert.equal(ruleOf("soft; by weight"), "weight");
  assert.equal(ruleOf("by count"), "count");
  assert.equal(ruleOf(""), "none");
  assert.equal(applyRule("soft; by weight", "count"), "soft; by count");
  assert.equal(applyRule("soft; by weight", "none"), "soft");
  assert.equal(applyRule(null, "weight"), "by weight");
  assert.equal(ruleProblem("soft", "count"), null);
  assert.match(ruleProblem("sold by weight at the deli", "none"), /in other words/);
});

test("package sizes are weights", () => {
  assert.equal(parseSize("1.9 kg"), 1900);
  assert.equal(parseSize("64 oz"), 1814.4);
  assert.equal(parseSize("1 lb"), 453.6);
  assert.equal(parseSize("500"), 500);
  assert.equal(parseSize("64 fl oz"), null);
  assert.equal(parseSize("2 cups"), null);
  assert.equal(parseSize("0 g"), null);
  assert.equal(sizeText(1900), "1.9 kg");
  assert.equal(sizeText(1992), "1992 g");
});

test("a package needs a container's name and a weight", () => {
  assert.equal(packageProblem("half-gallon", "1.9 kg", tandoorUnits), null);
  assert.equal(packageProblem("jug", "1.9 kg", tandoorUnits), null); // new: made on save
  assert.match(packageProblem("", "1 kg", tandoorUnits), /Name the package/);
  assert.match(packageProblem("cup", "1 kg", tandoorUnits), /is a measure/);
  assert.match(packageProblem("Quart", "1 kg", tandoorUnits), /is a measure/);
  assert.match(packageProblem("tbsp", "1 kg", tandoorUnits), /is a measure/);
  assert.match(packageProblem("jug", "2 cups", tandoorUnits), /as a weight/);
  // a recipe unit isn't a package: marking it would make other foods' conversions packages
  assert.match(packageProblem("Bunch", "100 g", tandoorUnits), /Recipes use “bunch”/);
});

test("only what changed is written", () => {
  const now = settingsOf(milk, halfGallon, {});
  assert.deepEqual(changes(milk, now, { ...now }), {});
  assert.deepEqual(changes(milk, now, { ...now, aisle: cats.canned }), { aisle: cats.canned });
  assert.deepEqual(changes(milk, now, { ...now, aisle: "Pet" }), { aisle: "Pet" });
  assert.deepEqual(changes(milk, now, { ...now, aisle: null }), { aisle: null });
  assert.deepEqual(changes(milk, now, { ...now, pkg: { name: "Half-Gallon", grams: 1992 } }), {});
  assert.deepEqual(changes(milk, now, { ...now, pkg: { name: "gallon jug", grams: 3784 } }), { pkg: { name: "gallon jug", grams: 3784 } });
});

test("leaving a package removes it; a weight rule is kept only where the aisle says otherwise", () => {
  const now = settingsOf(milk, halfGallon, {});
  assert.deepEqual(changes(milk, now, { aisle: cats.dairy, mode: "count" }), { pkg: null });
  assert.deepEqual(changes(milk, now, { aisle: cats.dairy, mode: "weight" }), { pkg: null, rule: "weight" });
  assert.deepEqual(changes(milk, now, { aisle: cats.meat, mode: "weight" }), { aisle: cats.meat, pkg: null });
  const b = settingsOf(beef, {}, {});
  assert.deepEqual(changes(beef, b, { aisle: cats.meat, mode: "count" }), { rule: "count" });
  assert.deepEqual(changes({ ...beef, description: "a;b" }, b, { aisle: cats.meat, mode: "weight" }), {});
  // moved to an aisle that already weighs: its own "by weight" is no longer needed
  const own = settingsOf(brie, {}, weighsFrom([brie]));
  assert.deepEqual(changes(brie, own, { aisle: cats.meat, mode: "weight" }), { aisle: cats.meat, rule: "none" });
});

function fakeApi({ conversions = [], tandoorFood = null } = {}) {
  const calls = [];
  let id = 900;
  const log = (...c) => calls.push(c);
  return {
    calls,
    addCategory: async name => { log("addCategory", name); return { id: id++, name }; },
    updateFood: async (food, patch) => log("updateFood", food.id, patch),
    getFood: async food => tandoorFood ?? food,
    addUnit: async name => { log("addUnit", name); return { id: id++, name, plural_name: name, base_unit: null, description: null }; },
    updateUnit: async (u, patch) => { log("updateUnit", u.name, patch); return { ...u, ...patch }; },
    foodConversions: async () => conversions,
    addConversion: async (food, unit, grams) => log("addConversion", unit.name, grams),
    updateConversion: async (cid, food, unit, grams) => log("updateConversion", cid, unit.name, grams),
    removeConversion: async cid => log("removeConversion", cid),
  };
}
const catalog = { units: tandoorUnits, categories: Object.values(cats) };
const HG = tandoorUnits.find(u => u.name === "half-gallon");
const G = tandoorUnits.find(u => u.name === "g");
const row = (cid, unit, food = milk) => ({ id: cid, food: { id: food.id, name: food.name }, base_unit: unit, converted_unit: G, base_amount: 1, converted_amount: 1992 });

test("moving to a new aisle makes the aisle first", async () => {
  const api = fakeApi();
  await saveFood(api, milk, { aisle: "Pet" }, catalog);
  await saveFood(api, milk, { aisle: "dairy" }, catalog);
  await saveFood(api, milk, { aisle: null }, catalog);
  assert.deepEqual(api.calls, [["addCategory", "Pet"], ["updateFood", 50, { aisle: { id: 900, name: "Pet" } }],
    ["updateFood", 50, { aisle: cats.dairy }], ["updateFood", 50, { aisle: null }]]);
});

test("a new package: the unit is made and marked, the new row goes in before the old one leaves", async () => {
  const api = fakeApi({ conversions: [row(7, HG), { id: 8, food: null, base_unit: HG, converted_unit: G }, row(9, tandoorUnits[12])] });
  await saveFood(api, milk, { pkg: { name: "jug", grams: 3784 } }, catalog);
  assert.deepEqual(api.calls, [["addUnit", "jug"], ["updateUnit", "jug", { plural_name: "jugs", description: "package" }],
    ["addConversion", "jug", 3784], ["removeConversion", 7]]);
});

test("the same package with a new size is updated in place", async () => {
  const api = fakeApi({ conversions: [row(7, HG)] });
  await saveFood(api, milk, { pkg: { name: "Half-gallon", grams: 1900 } }, catalog);
  assert.deepEqual(api.calls, [["updateConversion", 7, "half-gallon", 1900]]);
});

test("counted again: the package rows go and nothing else", async () => {
  const api = fakeApi({ conversions: [row(7, HG)] });
  await saveFood(api, milk, { pkg: null }, catalog);
  assert.deepEqual(api.calls, [["removeConversion", 7]]);
});

test("a rule goes into the description Tandoor has now, not the page's old copy", async () => {
  const api = fakeApi({ tandoorFood: { ...beef, description: "grass-fed, set by the importer" } });
  await saveFood(api, beef, { rule: "count" }, catalog);
  assert.deepEqual(api.calls, [["updateFood", 51, { description: "grass-fed, set by the importer; by count" }]]);
  const same = fakeApi({ tandoorFood: { ...beef, description: "by count" } });
  await saveFood(same, beef, { rule: "count" }, catalog);
  assert.deepEqual(same.calls, []);
});

test("a row the food already had in the new package's unit is updated, not doubled", async () => {
  const JUG = { id: 77, name: "jug", plural_name: "jugs", base_unit: null, description: "package" };
  const api = fakeApi({ conversions: [row(7, HG), row(8, { ...JUG, description: null })] });
  await saveFood(api, milk, { pkg: { name: "jug", grams: 3784 } }, { ...catalog, units: [...tandoorUnits, JUG] });
  assert.deepEqual(api.calls, [["updateConversion", 8, "jug", 3784], ["removeConversion", 7]]);
});
