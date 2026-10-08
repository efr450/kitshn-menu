import assert from "node:assert/strict";
import { test } from "node:test";
import { aisleOrder, exactFood, foodIndex, proposeFood, singular, stillTyping, suggestFoods } from "../public/foods.js";
import { catalogFoods, cats } from "./fixtures.js";

const index = foodIndex(catalogFoods);
const categories = Object.values(cats);
const names = list => list.map(s => s.food.name);

test("plural endings come off for matching", () => {
  assert.deepEqual(["tomatoes", "berries", "onions", "peaches", "boxes", "glass", "eggs", "gas"].map(singular),
    ["tomato", "berry", "onion", "peach", "box", "glass", "egg", "gas"]);
  assert.deepEqual(["citrus", "hummus", "hibiscus", "asparagus"].map(singular), ["citrus", "hummus", "hibiscus", "asparagus"]);
});

test("a food matches ignoring plurals, commas and word order", () => {
  assert.equal(exactFood("red onions", index).name, "Onion, red");
  assert.equal(exactFood("onion red", index).name, "Onion, red");
  assert.equal(exactFood("Whole Milk", index).name, "Milk, whole");
  assert.equal(exactFood("eggs", index).name, "Egg");
  assert.equal(exactFood("chicken thighs", index).name, "Chicken, thigh");
  assert.equal(exactFood("onion", index), null);
  assert.equal(exactFood("", index), null);
});

test("foods never bought aren't offered, but still match exactly (Tandoor won't make a second one)", () => {
  assert.equal(exactFood("water", index).name, "Water");
  assert.deepEqual(suggestFoods("wat", index), []);
});

test("autocomplete: every word starts a word of the food, best first", () => {
  assert.deepEqual(names(suggestFoods("chi", index)), ["Chicken, breast", "Chicken, thigh"]);
  assert.deepEqual(names(suggestFoods("chicken th", index)), ["Chicken, thigh"]);
  assert.deepEqual(names(suggestFoods("onion", index)), ["Onion powder", "Onion, red", "Onion, yellow"]);
  assert.deepEqual(names(suggestFoods("red onions", index)), ["Onion, red"]);
  assert.ok(suggestFoods("red onions", index)[0].exact);
  assert.deepEqual(names(suggestFoods("diced tomatoes", index)), ["Tomato, canned, diced"]);
  assert.deepEqual(names(suggestFoods("avo", index)), ["Avocado"]);
  assert.deepEqual(suggestFoods("kombucha", index), []);
  assert.equal(suggestFoods("o", index, 2).length, 2);
  // what's on the list comes first among equals
  assert.deepEqual(names(suggestFoods("milk", index)), ["Milk, oat", "Milk, whole"]);
  assert.deepEqual(names(suggestFoods("milk", index, 5, new Set([catalogFoods.find(f => f.name === "Milk, whole").id]))), ["Milk, whole", "Milk, oat"]);
});

test("still typing toward a suggestion isn't a new food yet", () => {
  assert.equal(stillTyping("avo", suggestFoods("avo", index)), true);
  assert.equal(stillTyping("chicken th", suggestFoods("chicken th", index)), true);
  assert.equal(stillTyping("diced tomatoes", suggestFoods("diced tomatoes", index)), false);
  assert.equal(stillTyping("kombucha", []), false);
});

test("a new kind of a food goes to its family's aisle, named head first and singular", () => {
  assert.deepEqual(proposeFood("chicken drumsticks", index, categories), { name: "Chicken, drumstick", aisle: cats.meat, guesses: [] });
  assert.deepEqual(proposeFood("sweet onions", index, categories), { name: "Onion, sweet", aisle: cats.produce, guesses: [] });
  assert.deepEqual(proposeFood("pink grapefruit juice", index, categories).name, "Pink grapefruit juice");
  // a number left in the name means the amount wasn't understood: ask instead
  assert.deepEqual(proposeFood("chicken 3pk", index, categories), { name: "Chicken, 3pk", aisle: null, guesses: [cats.meat] });
  // a multi-word head beats a one-word one
  assert.deepEqual(proposeFood("crunchy peanut butter", index, categories), { name: "Peanut butter, crunchy", aisle: cats.canned, guesses: [] });
});

test("a family split across aisles asks, offering those aisles busiest first", () => {
  const p = proposeFood("crushed tomatoes", index, categories);
  assert.equal(p.name, "Tomato, crushed");
  assert.equal(p.aisle, null);
  assert.deepEqual(p.guesses.map(c => c.name), ["Produce", "Canned"]);
});

test("anything else asks, guessing aisles of foods that share a word", () => {
  assert.deepEqual(proposeFood("kombucha", index, categories), { name: "Kombucha", aisle: null, guesses: [] });
  const napkins = proposeFood("paper napkins", index, categories);
  assert.equal(napkins.name, "Paper napkins");
  assert.deepEqual(napkins.guesses.map(c => c.name), ["Household"]);
  // a head on its own (no specifics) isn't a new kind of anything
  assert.equal(proposeFood("onion", index, categories).aisle, null);
});

test("aisle chips: busiest aisle first, then by name", () => {
  assert.deepEqual(aisleOrder(index, categories).map(c => c.name), ["Produce", "Dairy", "Canned", "Meat", "Herbs and Spices", "Household"]);
});
