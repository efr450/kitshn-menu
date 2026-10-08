// Turns Tandoor shopping entries into what the phone page shows: aisles of food rows, each with
// the buy amount (buy.js) and the recipe amounts. Pure, so test/list.test.js covers it; app.js only draws.

import { BY_WEIGHT_MARKER, buyChip, buyPackageKey, hasMarker } from "./buy.js";
import { isChange } from "./edit.js";

export const OTHER_AISLE = "Other";

/** A unit's name for this amount: its plural above 1 when it has one. */
export function unitLabel(unit, amount) {
  if (!unit) return null;
  const plural = unit.plural_name?.trim();
  return (amount > 1 && plural ? plural : unit.name?.trim()) || null;
}

/** 453.3333 g -> "453 g", 1.3333 -> "1.33", 2.5 stalks -> "2.5 stalks". */
export function formatAmount(amount, unitName) {
  const whole = unitName === "g" || unitName === "ml";
  const n = whole ? String(Math.round(amount)) : String(Math.round(amount * 100) / 100);
  return unitName ? `${n} ${unitName}` : n;
}

/**
 * The recipe amounts for one food's entries, like the tablet's chips: one per unit, adding up the
 * unchecked entries (or all of them once everything is checked); "some" for unmeasured ones.
 */
export function recipeAmounts(entries) {
  const out = [];
  const byUnit = new Map();
  for (const e of entries) {
    if (e.amount === 0 && !e.unit) continue;
    const k = e.unit ? e.unit.id : null;
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(e);
  }
  for (const list of byUnit.values()) {
    const all = list.every(e => e.checked);
    const sum = list.filter(e => !e.checked || all).reduce((s, e) => s + e.amount, 0);
    out.push({ text: formatAmount(sum, unitLabel(list[0].unit, sum)), sum });
  }
  if (entries.some(e => e.amount === 0 && !e.unit)) out.push({ text: "some", sum: 0 });
  return out;
}

const chipFor = (entries, food, packages) => buyChip(
  entries.map(e => ({ amount: e.amount, unitName: e.unit?.name ?? null, unitBaseUnit: e.unit?.base_unit ?? null, checked: e.checked })),
  hasMarker(food.supermarket_category?.description, BY_WEIGHT_MARKER),
  packages[buyPackageKey(food.name)] ?? null,
);
const joined = amounts => amounts.map(a => a.text).join(" + ");

/**
 * One row per food: {key, name, ids, done, buy, amounts, sub, edited, was, gone}. `packages` comes from
 * packagesFrom. A row changed on the phone (edit.js) is `edited`, and `was` says what it was before.
 */
export function foodRow(entries, packages) {
  const food = entries[0].food;
  const originals = entries.filter(e => !isChange(e));
  const edited = originals.length < entries.length;
  // once an amount is set on the phone, an unmeasured original ("some") adds nothing to say
  const amounts = recipeAmounts(edited ? entries.filter(e => isChange(e) || e.amount !== 0 || e.unit) : entries);
  const plural = amounts.some(a => a.sum > 1) && food.plural_name?.trim();
  const chip = chipFor(entries, food, packages);
  const before = originals.length ? joined(recipeAmounts(originals)).replace(/^some$/, "") : "";
  const fromRecipes = originals.length > 0 && originals.every(e => e.list_recipe_data?.recipe != null);
  return {
    key: food.id,
    name: plural ? food.plural_name.trim() : food.name,
    ids: entries.map(e => e.id),
    done: entries.every(e => e.checked),
    buy: chip?.label ?? null,
    // lowered to nothing on the phone: say so rather than "0 g"
    amounts: edited && amounts.length && amounts.every(a => a.sum <= 0) ? "none" : joined(amounts),
    // only changes left (their recipe was taken off) and nothing to buy: not worth a row
    gone: !originals.length && amounts.every(a => a.sum <= 0),
    // under the buy amount: what was asked for, before any change
    sub: chip && (before || !edited) ? `${before || joined(amounts)} ${fromRecipes ? "in recipes" : "on the list"}` : null,
    edited,
    was: edited ? (originals.length ? chipFor(originals, food, packages)?.label || before || "no amount" : "no amount") : null,
  };
}

/** Aisles ({name, rows, left}) in name order with Other last; rows in food name order. */
export function shoppingAisles(entries, packages) {
  const byFood = new Map();
  for (const e of entries) {
    if (!e.food) continue; // Tandoor allows an entry without a food; there's nothing to show for it
    if (!byFood.has(e.food.id)) byFood.set(e.food.id, []);
    byFood.get(e.food.id).push(e);
  }
  const aisles = new Map();
  for (const list of byFood.values()) {
    const name = list[0].food.supermarket_category?.name || OTHER_AISLE;
    if (!aisles.has(name)) aisles.set(name, []);
    const row = foodRow(list, packages);
    if (!row.gone) aisles.get(name).push(row);
  }
  const order = (a, b) => (a === OTHER_AISLE) - (b === OTHER_AISLE) || a.localeCompare(b);
  return [...aisles.keys()].filter(name => aisles.get(name).length).sort(order).map(name => {
    const rows = aisles.get(name).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return { name, rows, left: rows.filter(r => !r.done).length };
  });
}
