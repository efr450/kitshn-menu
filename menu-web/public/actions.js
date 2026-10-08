// The writes behind adding an item and changing an amount on the phone page: which Tandoor calls,
// in which order. `api` is api.js's (injected, so test/actions.test.js drives it with a fake);
// app.js refreshes the list afterwards. Adding and changing need signal; a failure throws with
// api.js's kind ("offline" | "signin" | "error") and nothing is queued.

import { gramsPerUnit } from "./buy.js";
import { EDIT_LIST, change, editListId, isChange } from "./edit.js";

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Add a typed item. `food` is a Tandoor food, or {name, aisle} for a new one where `aisle` is a
 * category or a new aisle's name. Weights are stored in grams, like every recipe amount; other
 * units as typed. Returns what happened: "added" | "unticked" | "already".
 */
export async function addItem(api, { food, amount, unit, entries, catalog }) {
  if (food.id == null) {
    let aisle = food.aisle;
    if (typeof aisle === "string") aisle = catalog.categories.find(c => same(c.name, aisle)) ?? await api.addCategory(aisle.trim());
    food = await api.addFood(food.name, aisle);
  }
  const mine = entries.filter(e => e.food?.id === food.id);
  if (amount == null) {
    // already there: bring it back if it was ticked off, else leave it
    if (mine.length && mine.every(e => e.checked)) { await api.setChecked(mine.map(e => e.id), false); return "unticked"; }
    if (mine.length) return "already";
    await api.addEntry({ food, amount: 0 });
    return "added";
  }
  const g = unit ? gramsPerUnit(unit.base_unit, unit.name) : null;
  const grams = g != null && catalog.units.find(u => u.base_unit === "g" || u.name === "g");
  await api.addEntry(grams ? { food, amount: Math.round(amount * g * 10) / 10, unit: grams } : { food, amount, unit: unit ?? null });
  return "added";
}

/**
 * Bring a row to `target` (edit.js plan units; `unit` for a row with no amount yet): delete, change
 * or add the one change entry. `all` is the whole list: every food's changes share one EDIT_LIST
 * group, made on first use and deleted with the last change in it (Tandoor can't find an empty one).
 * A change is ticked like its row: Tandoor only lists ticked entries it stamped as ticked, so a new
 * one is made unticked and then ticked, and an amount update always says whether it's ticked.
 */
export async function setRowAmount(api, { plan, target, unit, all, food, done }) {
  const c = change(plan, target, unit);
  const group = editListId(all);
  const othersInGroup = all.filter(e => isChange(e) && e.list_recipe === group && !c.remove.includes(e.id) && e.id !== c.set?.id);
  if (c.remove.length && !c.set && !c.add && group != null && !othersInGroup.length && c.remove.every(id => all.find(e => e.id === id)?.list_recipe === group)) {
    await api.removeEditList(group); // takes its entries with it
    return;
  }
  for (const id of c.remove) await api.removeEntry(id);
  if (c.set) await api.setAmount(c.set.id, c.set.amount, done);
  if (c.add) {
    const listRecipe = group ?? (await api.addEditList(EDIT_LIST)).id;
    const made = await api.addEntry({ food, amount: c.add.amount, unit: c.add.unit, listRecipe });
    if (done) await api.setChecked([made.id], true);
  }
}
