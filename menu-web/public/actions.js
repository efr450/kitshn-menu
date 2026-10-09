// The writes behind adding an item and changing an amount on the phone page: which Tandoor calls,
// in which order. `api` is api.js's (injected, so test/actions.test.js drives it with a fake);
// app.js refreshes the list afterwards. A failure throws with api.js's kind ("offline" | "signin" |
// "error"); adds made with no signal wait in queue.js, which sends them through addItem later.

import { gramsPerUnit } from "./buy.js";
import { EDIT_LIST, change, editListId, isChange } from "./edit.js";

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Add a typed item. `food` is a Tandoor food, or {name, aisle} for a new one where `aisle` is a
 * category or a new aisle's name. Weights are stored in grams, like every recipe amount; other
 * units as typed. Returns what happened: "added" | "unticked" | "already". `onFood` hears about a
 * food this made, so a second add of the same new name (queue.js) reuses it.
 */
export async function addItem(api, { food, amount, unit, entries, catalog, onFood = () => {} }) {
  if (food.id == null) {
    let aisle = food.aisle;
    if (typeof aisle === "string") aisle = catalog.categories.find(c => same(c.name, aisle)) ?? await api.addCategory(aisle.trim());
    food = await api.addFood(food.name, aisle);
    onFood(food);
  }
  const mine = entries.filter(e => e.food?.id === food.id);
  if (amount == null) {
    // already there: bring it back if it was ticked off, else leave it
    if (mine.length && mine.every(e => e.checked)) { await api.setChecked(mine.map(e => e.id), false); return "unticked"; }
    if (mine.length) return "already";
    await api.addEntry({ food, amount: 0 });
    return "added";
  }
  await api.addEntry({ food, ...storedAmount(amount, unit, catalog.units) });
  return "added";
}

/** A typed amount as it's stored: weights in grams (like every recipe amount), other units as typed. */
export function storedAmount(amount, unit, units) {
  const g = unit ? gramsPerUnit(unit.base_unit, unit.name) : null;
  const grams = g != null && units.find(u => u.base_unit === "g" || u.name === "g");
  return grams ? { amount: Math.round(amount * g * 10) / 10, unit: grams } : { amount, unit: unit ?? null };
}

/**
 * Delete these entries (a swiped row, or every ticked one). When they include every change in the
 * EDIT_LIST group, the group goes too (deleting it takes its entries), so no empty group is left behind.
 * One already deleted elsewhere counts as done.
 */
export async function removeEntries(api, ids, all) {
  const gone = new Set(ids);
  const group = editListId(all);
  const changes = all.filter(e => isChange(e) && e.list_recipe === group);
  if (group != null && changes.length && changes.every(e => gone.has(e.id))) {
    await api.removeEditList(group);
    for (const e of changes) gone.delete(e.id);
  }
  for (const id of gone) {
    try { await api.removeEntry(id); } catch (e) { if (e.status !== 404) throw e; } // already gone (the tablet, mi shop)
  }
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
