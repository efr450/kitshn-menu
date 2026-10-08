import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buyChip, buyPackageKey, gramsPerUnit, hasMarker, packagesFrom } from "../public/buy.js";

const cases = JSON.parse(readFileSync(new URL("../buy-cases.json", import.meta.url), "utf8"));
const line = ([amount, unitName, unitBaseUnit, checked]) => ({ amount, unitName, unitBaseUnit, checked });
const conv = ([id, food, a, au, b, bu]) => ({
  id, food: food == null ? null : { id, name: food },
  base_amount: a, base_unit: cases.units[au], converted_amount: b, converted_unit: cases.units[bu],
});

for (const c of cases.buyChip) {
  test(`buyChip: ${c.name}`, () => {
    assert.deepEqual(buyChip(c.lines.map(line), c.byWeight, c.pkg), c.expect);
  });
}

for (const c of cases.packagesFrom) {
  test(`packagesFrom: ${c.name}`, () => {
    const got = packagesFrom(c.conversions.map(conv));
    assert.deepEqual(Object.keys(got).sort(), Object.keys(c.expect).sort());
    for (const [k, want] of Object.entries(c.expect)) {
      assert.equal(got[k].name, want.name);
      assert.equal(got[k].pluralName, want.pluralName);
      assert.ok(Math.abs(got[k].grams - want.grams) < 0.001, `${k}: ${got[k].grams} g`);
    }
  });
}

for (const [desc, marker, want] of cases.hasMarker) {
  test(`hasMarker: ${JSON.stringify(desc)} / ${marker}`, () => assert.equal(hasMarker(desc, marker), want));
}

test("package keys ignore case and spaces", () => assert.equal(buyPackageKey(" MILK, Whole "), "milk, whole"));

test("weights by base unit, else by name", () => {
  assert.equal(gramsPerUnit("g", "g"), 1);
  assert.equal(gramsPerUnit("pound", "lb"), 453.592);
  assert.equal(gramsPerUnit(null, "oz"), 28.3495);
  assert.equal(gramsPerUnit(" ", "kg"), 1000);
  assert.equal(gramsPerUnit(null, "can"), null);
  assert.equal(gramsPerUnit("us_cup", "cup"), null);
});
