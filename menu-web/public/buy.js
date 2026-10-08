// The "buy as" rules for the phone page: the same rules as the app's BuyAs.kt, in JavaScript.
// ../buy-cases.json holds cases both copies must pass (test/buy.test.js here, BuyCasesTest in the app),
// so a change to one copy fails a test until the other matches. Everything here is pure.

export const PACKAGE_MARKER = "package";
export const BY_WEIGHT_MARKER = "by weight";

const GRAMS_PER_LB = 453.592;
const GRAMS_PER_OZ = 28.3495;

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `description` contains `marker` as its own words ("by weight", not "bye weightless"). */
export function hasMarker(description, marker) {
  return description != null && new RegExp(`(^|\\W)${escape(marker)}($|\\W)`, "i").test(description);
}

/** The key packagesFrom files a food's package under. */
export const buyPackageKey = foodName => foodName.trim().toLowerCase();

/** Grams in one of a unit when it's a weight (by Tandoor base unit, else by name), else null. */
export function gramsPerUnit(baseUnit, name) {
  const key = ((baseUnit && baseUnit.trim()) ? baseUnit : name)?.trim().toLowerCase();
  switch (key) {
    case "g": case "gram": case "grams": return 1;
    case "kg": case "kilogram": case "kilograms": return 1000;
    case "ounce": case "oz": case "ounces": return GRAMS_PER_OZ;
    case "pound": case "lb": case "lbs": case "pounds": return GRAMS_PER_LB;
    default: return null;
  }
}

/**
 * Food -> package size ({name, pluralName, grams}) from Tandoor's unit conversions: rows for one food
 * between a weight and a unit marked PACKAGE_MARKER, either way round. The oldest row (lowest id) wins.
 */
export function packagesFrom(conversions) {
  const pkg = (unit, amount, weight, weightAmount) => {
    if (!hasMarker(unit.description, PACKAGE_MARKER) || amount <= 0) return null;
    const g = gramsPerUnit(weight.base_unit, weight.name);
    return g == null ? null : { name: unit.name, pluralName: unit.plural_name ?? null, grams: weightAmount * g / amount };
  };
  const out = {};
  for (const c of [...conversions].sort((a, b) => a.id - b.id)) {
    if (!c.food) continue;
    const key = buyPackageKey(c.food.name);
    if (key in out) continue;
    const p = pkg(c.base_unit, c.base_amount, c.converted_unit, c.converted_amount)
      ?? pkg(c.converted_unit, c.converted_amount, c.base_unit, c.base_amount);
    if (p) out[key] = p;
  }
  return out;
}

/**
 * The buy chip ({label, checked}) for one food's lines ({amount, unitName, unitBaseUnit, checked}),
 * or null when there's nothing useful to say. See buyChip in BuyAs.kt for the reasoning.
 */
export function buyChip(lines, byWeight, pkg) {
  // negative amounts count: edit.js stores a lowered amount as a negative difference entry
  const measured = lines.filter(l => l.amount !== 0);
  if (!measured.length) return null;

  const grams = l => {
    const g = gramsPerUnit(l.unitBaseUnit, l.unitName);
    if (g != null) return l.amount * g;
    if (pkg && l.unitName != null && l.unitName.toLowerCase() === pkg.name.toLowerCase()) return l.amount * pkg.grams;
    return null;
  };

  if (measured.some(l => grams(l) == null)) return null;
  const usWeight = l => { const g = gramsPerUnit(l.unitBaseUnit, l.unitName); return g === GRAMS_PER_OZ || g === GRAMS_PER_LB; };
  if (!pkg && measured.every(usWeight)) return null;

  const allChecked = measured.every(l => l.checked);
  const total = measured.filter(l => !l.checked || allChecked).reduce((s, l) => s + grams(l), 0);
  const label = buyAsLabel(total, byWeight, pkg);
  return label == null ? null : { label, checked: allChecked };
}

/** How you'd buy `grams` of a food: whole packages rounded up, else pounds for by-weight foods, else null. */
export function buyAsLabel(grams, byWeight, pkg) {
  if (grams <= 0) return null;
  if (pkg && pkg.grams > 0) {
    const n = Math.max(1, Math.ceil(grams / pkg.grams - 1e-9));
    return `${n} ` + (n === 1 ? pkg.name : ((pkg.pluralName && pkg.pluralName.trim()) ? pkg.pluralName : pkg.name));
  }
  return byWeight ? pounds(grams) : null;
}

/** `grams` as you'd ask at the counter: lb rounded up to the ¼ lb ("1½ lb"); whole oz under ¼ lb. */
export function pounds(grams) {
  const quarters = grams / GRAMS_PER_LB * 4;
  if (quarters < 0.9) return `${Math.ceil(grams / GRAMS_PER_OZ - 1e-9)} oz`;
  const q = Math.ceil(quarters - 0.1);
  const frac = ["", "¼", "½", "¾"][q % 4];
  const whole = Math.floor(q / 4);
  return (whole === 0 ? frac : `${whole}${frac}`) + " lb";
}
