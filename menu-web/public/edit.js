// Changing a row's amount on the phone page. Tandoor's entries stay as the recipes (or the shopper)
// added them; a change is one more entry for the food, the difference, filed under a shopping-list
// "recipe" called EDIT_LIST. So the original is always there to show, Reset just deletes the
// difference, and the tablet, which adds a food's entries up per unit, shows the new total unchanged.
// Pure, so test/edit.test.js covers it; app.js sends what plan() and change() say.

import { buyPackageKey, byWeightOf, gramsPerUnit } from "./buy.js";

export const EDIT_LIST = "Changed by hand";
const GRAMS_PER_LB = 453.592;

/** An entry holding a change made on the phone (not one a recipe or the add box made). */
export const isChange = e => e.list_recipe_data?.name === EDIT_LIST && e.list_recipe_data?.recipe == null;

/** The id of the EDIT_LIST group if any entry is in one, else null. */
export const editListId = entries => entries.find(isChange)?.list_recipe ?? null;

// the entries that count: unchecked ones, or all of them once everything is checked (like the chips)
const counted = entries => entries.every(e => e.checked) ? entries : entries.filter(e => !e.checked);

const gramsOf = (e, pkg) => {
  const g = gramsPerUnit(e.unit?.base_unit ?? null, e.unit?.name ?? null);
  if (g != null) return e.amount * g;
  if (pkg && e.unit?.name?.toLowerCase() === pkg.name.toLowerCase()) return e.amount * pkg.grams;
  return null;
};

const sameUnit = (a, b) => (a?.id ?? null) === (b?.id ?? null);

/**
 * How a food's amount can be changed: {kind, value, was, step, unit, choices, changes}.
 *  - kind "pack": in whole packages (the buy chip's), "lb": in ¼ lb for by-weight aisles,
 *    "unit": in the row's one unit, "add": no amount yet (pick a unit from `choices`), null: mixed units.
 *  - value: the amount now, in that kind's units; was: the same before any change (null if none).
 *  - changes: the EDIT_LIST entries now on the row.
 * `units` are Tandoor's units (for grams and the package unit); `weighs` comes from weighsFrom.
 */
export function plan(entries, packages, units, weighs = {}) {
  const food = entries[0].food;
  const pkg = packages[buyPackageKey(food.name)] ?? null;
  const byWeight = byWeightOf(food, weighs);
  const changes = entries.filter(isChange);
  const now = counted(entries).filter(e => e.amount !== 0);
  const before = counted(entries).filter(e => !isChange(e) && e.amount !== 0);
  const grams = units.find(u => u.base_unit === "g" || u.name === "g") ?? null;
  const sum = (list, f) => list.reduce((s, e) => s + f(e), 0);

  const asGrams = list => list.every(e => gramsOf(e, pkg) != null);
  if (now.length && pkg && grams && asGrams(now) && asGrams(before)) {
    const packs = g => Math.max(0, Math.ceil(g / pkg.grams - 1e-9));
    return { kind: "pack", unit: grams, step: 1, changes, label: pkg, origin: sum(before, e => gramsOf(e, pkg)),
      value: packs(sum(now, e => gramsOf(e, pkg))), was: before.length ? packs(sum(before, e => gramsOf(e, pkg))) : null, per: pkg.grams };
  }
  if (now.length && byWeight && grams && asGrams(now) && asGrams(before)) {
    const lb = g => Math.ceil(g / GRAMS_PER_LB * 4 - 0.1) / 4;
    return { kind: "lb", unit: grams, step: 0.25, changes, origin: sum(before, e => gramsOf(e, null)),
      value: lb(sum(now, e => gramsOf(e, null))), was: before.length ? lb(sum(before, e => gramsOf(e, null))) : null, per: GRAMS_PER_LB };
  }
  if (now.length && now.every(e => sameUnit(e.unit, now[0].unit)) && before.every(e => sameUnit(e.unit, now[0].unit))) {
    const u = now[0].unit ?? null;
    const step = u && (u.base_unit === "g" || u.base_unit === "ml" || u.name === "g" || u.name === "ml") ? 50 : 1;
    return { kind: "unit", unit: u, step, changes, origin: sum(before, e => e.amount),
      value: sum(now, e => e.amount), was: before.length ? sum(before, e => e.amount) : null, per: 1 };
  }
  if (!now.length) {
    // nothing measured yet ("some", or a typed name): count it, or buy it by its package or by the pound
    const choices = [null];
    const pkgUnit = pkg && units.find(u => u.name.toLowerCase() === pkg.name.toLowerCase());
    if (pkgUnit) choices.push(pkgUnit);
    const lbUnit = units.find(u => u.base_unit === "pound");
    if (byWeight && lbUnit) choices.push(lbUnit);
    return { kind: "add", unit: null, step: 1, changes, origin: 0, value: null, was: null, per: 1, choices };
  }
  return { kind: null, changes, value: null, was: null };
}

/**
 * What to write so the row comes to `target` (in the plan's units; for "add", in `unit`):
 * {remove: [ids], set: {id, amount} | null, add: {amount, unit} | null}. Back to the original
 * means deleting every change; otherwise one change entry carries the difference.
 */
export function change(p, target, unit = p.unit) {
  const ids = p.changes.map(e => e.id);
  const diff = p.kind === "add" ? target : target * p.per - p.origin;
  // back to what it was (packages and pounds round, so compare in the plan's units, not grams)
  const back = p.kind !== "add" && (target === (p.was ?? 0));
  if (p.kind == null || back || Math.abs(diff) < 1e-6 || (p.kind === "add" && target <= 0)) return { remove: ids, set: null, add: null };
  const amount = Math.round(diff * 1000) / 1000;
  const keep = p.changes.find(e => sameUnit(e.unit, unit));
  if (keep) return { remove: ids.filter(id => id !== keep.id), set: { id: keep.id, amount }, add: null };
  return { remove: ids, set: null, add: { amount, unit } };
}
