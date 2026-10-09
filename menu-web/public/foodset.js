// A food's settings on the phone page, opened by holding its row: which aisle it's in, and how it's
// bought (counted, by the pound, or in a package of a set size). Everything is Tandoor data, so a
// change shows everywhere the food does:
//  - aisle: the food's supermarket category (none files it under Other)
//  - by weight / by count: buy.js's marker in the food's description, which overrules the aisle's
//  - package: a unit marked buy.js's PACKAGE_MARKER and a food conversion "1 <unit> = N g", the same
//    data the importer's `mi foods package` writes (menu_import/buy.py); a food keeps one package
// `api` is api.js's (injected, so test/foodset.test.js drives it with a fake); app.js only draws.

import { BY_COUNT_MARKER, BY_WEIGHT_MARKER, PACKAGE_MARKER, buyPackageKey, byWeightOf, gramsPerUnit, hasMarker } from "./buy.js";

export const MODES = ["count", "weight", "package"];

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What the sheet starts from: {aisle: category | null, mode, pkg: {name, grams} | null, ownRule}.
 * `food` is the catalog's food (with its description); `ownRule` says the food overrules its aisle.
 */
export function settingsOf(food, packages, weighs) {
  const pkg = packages[buyPackageKey(food.name)] ?? null;
  const mode = pkg ? "package" : byWeightOf(food, weighs) ? "weight" : "count";
  return { aisle: food.supermarket_category ?? null, mode, pkg: pkg && { name: pkg.name, grams: pkg.grams }, ownRule: buyPackageKey(food.name) in weighs };
}

/** Whether an aisle (a category, or null for Other) buys by the pound. */
export const aisleWeighs = aisle => hasMarker(aisle?.description, BY_WEIGHT_MARKER);

/**
 * The description with `marker` added ("...; marker") or its own "; marker" part taken out, the rest
 * kept as written (buy.py's with_marker). Free text that merely contains the words stays.
 */
export function withMarker(description, marker, on) {
  const desc = (description ?? "").trim();
  if (on) return hasMarker(desc, marker) ? desc : desc ? `${desc}; ${marker}` : marker;
  const parts = desc.split(";").map(p => p.trim());
  return parts.some(p => p.toLowerCase() === marker) ? parts.filter(p => p && p.toLowerCase() !== marker).join("; ") : desc;
}

/** A food's own say on weight: "weight" | "count" | "none" (its aisle decides). */
export const ruleOf = description => hasMarker(description, BY_COUNT_MARKER) ? "count" : hasMarker(description, BY_WEIGHT_MARKER) ? "weight" : "none";

/** `description` saying `rule` ("weight" | "count" | "none"), the rest kept. */
export function applyRule(description, rule) {
  const bare = withMarker(withMarker(description, BY_WEIGHT_MARKER, false), BY_COUNT_MARKER, false);
  return rule === "none" ? bare : withMarker(bare, rule === "weight" ? BY_WEIGHT_MARKER : BY_COUNT_MARKER, true);
}

// weights a package size can be given in; a volume would need the food's density, which the importer has
const WEIGHTS = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };

/** "1.9 kg", "64 oz", "1 lb", "500 g", "500" (grams) -> grams, or null. */
export function parseSize(text) {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)\s*$/i.exec(text ?? "");
  if (!m) return null;
  const per = m[2] ? WEIGHTS[m[2].toLowerCase()] : 1;
  const g = per && Number(m[1]) * per;
  return g > 0 ? Math.round(g * 10) / 10 : null;
}

/** 1992 -> "1992 g", 1900 -> "1.9 kg": a package size as the sheet shows it. */
export const sizeText = g => g >= 1000 && g % 100 === 0 ? `${g / 1000} kg` : `${Math.round(g)} g`;

// names that are measures, never containers (buy.py's is_measure): "quart carton" is a package, "quart" isn't
const MEASURES = new Set(["g", "gram", "grams", "kg", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "ml", "l", "liter",
  "liters", "litre", "litres", "cup", "cups", "tbsp", "tsp", "tablespoon", "teaspoon", "fl oz", "pint", "quart", "gallon"]);

/**
 * What's wrong with the package fields, or null: a missing name, a measure for a name, a size that
 * isn't a weight. `units` are Tandoor's.
 */
export function packageProblem(name, sizeText, units) {
  const n = (name ?? "").trim();
  if (!n) return "Name the package (carton, bag, half-gallon).";
  const unit = units.find(u => same(u.name, n));
  if (MEASURES.has(n.toLowerCase()) || (unit && (unit.base_unit || gramsPerUnit(null, unit.name) != null)))
    return `“${n}” is a measure. Name the container, like “quart carton”.`;
  // marking a recipe unit (bunch, clove) as a package would turn other foods' conversions into packages
  if (unit && !hasMarker(unit.description, PACKAGE_MARKER)) return `Recipes use “${unit.name}” as a unit. Name the container, like “bag”.`;
  if (parseSize(sizeText) == null) return "Give the size as a weight: 1.9 kg, 64 oz, 500 g.";
  return null;
}

// an aisle is a category, a new aisle's name, or null (Other)
const aisleKey = a => a == null ? null : typeof a === "string" ? `new:${a.trim().toLowerCase()}` : a.id;

/**
 * The writes that take `food` from `now` (settingsOf) to `want` ({aisle, mode, pkg}; `aisle` may be a
 * new aisle's name): {aisle?, rule?, pkg?}. A key is left out when that part doesn't change; `rule` is
 * the food's own say on weight (ruleOf), kept only where it differs from the aisle it's going to;
 * `pkg: null` removes the package.
 */
export function changes(food, now, want) {
  const out = {};
  if (aisleKey(want.aisle) !== aisleKey(now.aisle)) out.aisle = want.aisle;
  if (want.mode === "package") {
    if (!now.pkg || !same(now.pkg.name, want.pkg.name) || Math.abs(now.pkg.grams - want.pkg.grams) > 0.05) out.pkg = want.pkg;
    return out;
  }
  if (now.mode === "package") out.pkg = null;
  const weighs = want.mode === "weight";
  const rule = weighs === aisleWeighs(want.aisle) ? "none" : weighs ? "weight" : "count";
  if (rule !== ruleOf(food.description)) out.rule = rule;
  return out;
}

/** Why `rule` can't be written into `description`, or null: free text there already says "by weight". */
export function ruleProblem(description, rule) {
  return ruleOf(applyRule(description, rule)) === rule ? null
    : "Its note in Tandoor says “by weight” in other words. Change the note in Tandoor first.";
}

/**
 * Send `plan` (changes) for `food`. A new aisle (a name) is made first. The rule goes into the food's
 * description as Tandoor has it now, so a note changed elsewhere isn't lost. A package unit is made or
 * marked first; the food's old package rows go only once the new one is in, so a failed write never
 * leaves it with none. `catalog` is the page's ({units, categories}).
 */
export async function saveFood(api, food, plan, catalog) {
  if ("aisle" in plan) {
    let aisle = plan.aisle;
    if (typeof aisle === "string") aisle = catalog.categories.find(c => same(c.name, aisle)) ?? await api.addCategory(aisle.trim());
    await api.updateFood(food, { aisle });
  }
  if ("rule" in plan) {
    const fresh = await api.getFood(food);
    const description = applyRule(fresh.description, plan.rule);
    if (description !== (fresh.description ?? "").trim()) await api.updateFood(fresh, { description });
  }
  if (!("pkg" in plan)) return;

  const unit = plan.pkg ? await packageUnit(api, plan.pkg.name.trim(), catalog.units) : null;
  // read after the unit is marked, so a row it already had counts as this package's
  const rows = (await api.foodConversions(food)).filter(c => c.food?.id === food.id
    && (hasMarker(c.base_unit?.description, PACKAGE_MARKER) || hasMarker(c.converted_unit?.description, PACKAGE_MARKER)
      || c.base_unit?.id === unit?.id || c.converted_unit?.id === unit?.id));
  let keep = null;
  if (unit) {
    const grams = Math.round(plan.pkg.grams * 10) / 10;
    keep = rows.find(c => c.base_unit?.id === unit.id || c.converted_unit?.id === unit.id) ?? null;
    if (keep) await api.updateConversion(keep.id, food, unit, grams);
    else await api.addConversion(food, unit, grams);
  }
  for (const c of rows) if (c !== keep) await api.removeConversion(c.id);
}

// the unit called `name`, made if missing, marked as a package and given a real plural
async function packageUnit(api, name, units) {
  let u = units.find(x => same(x.name, name)) ?? await api.addUnit(name);
  // Tandoor's unit create copies the name into plural_name
  const plural = u.plural_name && u.plural_name !== u.name ? u.plural_name : u.name + (/(s|x|ch|sh)$/i.test(u.name) ? "es" : "s");
  const description = withMarker(u.description, PACKAGE_MARKER, true);
  if (u.plural_name !== plural || (u.description ?? "") !== description) u = await api.updateUnit(u, { plural_name: plural, description });
  return u;
}
