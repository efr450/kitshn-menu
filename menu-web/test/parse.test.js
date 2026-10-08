import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount, unitIndex } from "../public/parse.js";
import { tandoorUnits } from "./fixtures.js";

const index = unitIndex(tandoorUnits);
const read = text => {
  const r = parseAmount(text, index);
  return [r.amount, r.unit?.name ?? null, r.rest];
};

test("an amount in front, with or without a unit", () => {
  assert.deepEqual(read("2 lb chicken thighs"), [2, "lb", "chicken thighs"]);
  assert.deepEqual(read("3 avocados"), [3, null, "avocados"]);
  assert.deepEqual(read("2 lbs of chicken drumsticks"), [2, "lb", "chicken drumsticks"]);
  assert.deepEqual(read("2 pounds ground beef"), [2, "lb", "ground beef"]);
  assert.deepEqual(read("500 grams flour"), [500, "g", "flour"]);
  assert.deepEqual(read("8 fl oz cream"), [8, "fl oz", "cream"]);
});

test("fractions, mixed numbers and decimals", () => {
  assert.deepEqual(read("1 1/2 lb ground beef"), [1.5, "lb", "ground beef"]);
  assert.deepEqual(read("1½ lb ground beef"), [1.5, "lb", "ground beef"]);
  assert.deepEqual(read("½ lb ham"), [0.5, "lb", "ham"]);
  assert.deepEqual(read("1.25 kg potatoes"), [1.25, "kg", "potatoes"]);
  assert.deepEqual(read("3/4 cup rice"), [0.75, "cup", "rice"]);
});

test("words: a, a dozen, two cans, a couple, half a, a unit with no number", () => {
  assert.deepEqual(read("three limes"), [3, null, "limes"]);
  assert.deepEqual(read("a lime"), [1, null, "lime"]);
  assert.deepEqual(read("a couple avocados"), [2, null, "avocados"]);
  assert.deepEqual(read("couple of lemons"), [2, null, "lemons"]);
  assert.deepEqual(read("half a lb of ham"), [0.5, "lb", "ham"]);
  assert.deepEqual(read("a dozen eggs"), [12, null, "eggs"]);
  assert.deepEqual(read("dozen eggs"), [12, null, "eggs"]);
  assert.deepEqual(read("2 dozen eggs"), [24, null, "eggs"]);
  assert.deepEqual(read("two cans black beans"), [2, "can", "black beans"]);
  assert.deepEqual(read("a can of coconut milk"), [1, "can", "coconut milk"]);
  assert.deepEqual(read("half gallon whole milk"), [1, "half-gallon", "whole milk"]);
  assert.deepEqual(read("2 half-gallons milk"), [2, "half-gallon", "milk"]);
  assert.deepEqual(read("bunch cilantro"), [1, "bunch", "cilantro"]);
});

test("'2x' and 'x2' multiply; so does '6 x 1 lb'; thousands may have a comma", () => {
  assert.deepEqual(read("6 x 1 lb butter"), [6, "lb", "butter"]);
  assert.deepEqual(read("1,000 g flour"), [1000, "g", "flour"]);
  assert.deepEqual(read("2x cans diced tomatoes"), [2, "can", "diced tomatoes"]);
  assert.deepEqual(read("2 x tubs yogurt"), [2, "tub", "yogurt"]);
  assert.deepEqual(read("eggs x12"), [12, null, "eggs"]);
  assert.deepEqual(read("eggs x 12"), [12, null, "eggs"]);
});

test("an amount at the end, after a comma or as number and unit", () => {
  assert.deepEqual(read("milk, 2 half-gallons"), [2, "half-gallon", "milk"]);
  assert.deepEqual(read("chicken thighs 2 lb"), [2, "lb", "chicken thighs"]);
  assert.deepEqual(read("limes, 4"), [4, null, "limes"]);
});

test("words that only look like amounts stay in the name", () => {
  assert.deepEqual(read("half and half"), [null, null, "half and half"]);
  assert.deepEqual(read("a1 sauce"), [null, null, "a1 sauce"]);
  assert.deepEqual(read("kombucha"), [null, null, "kombucha"]);
  assert.deepEqual(read("paper towels"), [null, null, "paper towels"]);
  assert.deepEqual(read("juice box"), [null, null, "juice box"]);
  assert.deepEqual(read("cream cheese tub"), [null, null, "cream cheese tub"]);
  assert.deepEqual(read("7 up"), [7, null, "up"]); // a leading number is an amount, so a brand like this reads oddly
});

test("a unit word alone, or a number alone, is not an item", () => {
  assert.deepEqual(read("2"), [null, null, "2"]);
  assert.deepEqual(read("lb"), [null, null, "lb"]);
  assert.deepEqual(read(""), [null, null, ""]);
});

test("a unit that only shares a base never takes its spoken words (Tandoor's pinch is based on ml)", () => {
  assert.equal(index.get("ml").name, "ml");
  assert.equal(index.get("milliliters").name, "ml");
  assert.equal(index.get("pounds").name, "lb");
  assert.equal(index.get("pinches").name, "pinch");
  // and a unit list in the other order says the same
  const reversed = unitIndex([...tandoorUnits].reverse());
  assert.equal(reversed.get("ml").name, "ml");
  assert.equal(reversed.get("milliliter").name, "ml");
});
