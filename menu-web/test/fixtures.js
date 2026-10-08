// Tandoor-shaped shopping entries for the tests.
const G = { id: 13, name: "g", plural_name: "g", base_unit: "g" };
const STALK = { id: 20, name: "stalk", plural_name: "stalks", base_unit: null };
const MEAT = { id: 4, name: "Meat", description: "by weight" };
const DAIRY = { id: 17, name: "Dairy", description: null };
const PRODUCE = { id: 2, name: "Produce", description: null };

let next = 1;
export function entry(food, amount, unit = null, { checked = false, category = null, plural = null, foodId } = {}) {
  return {
    id: next++, amount, unit, checked,
    food: { id: foodId ?? food.length * 1000 + food.charCodeAt(0), name: food, plural_name: plural, supermarket_category: category },
  };
}

export const units = { G, STALK };
export const aisles = { MEAT, DAIRY, PRODUCE };
export const milk = { "milk, whole": { name: "half-gallon", pluralName: "half-gallons", grams: 1992 } };

// Tandoor's units as they were on 2026-10-08 (the page reads them live)
export const tandoorUnits = [
  [25, "block", "blocks", null, "package"], [2, "bottle", "bottles", null, "package"], [23, "box", "boxes", null, "package"],
  [28, "bunch", "bunch", null, null], [1, "can", "cans", null, "package"], [22, "carton", "cartons", null, "package"],
  [16, "clove", "cloves", null, null], [12, "cup", "cups", "us_cup", null], [7, "fl oz", "fl oz", "fluid_ounce", null],
  [13, "g", "g", "g", null], [19, "half-gallon", "half-gallons", null, "package"], [10, "kg", "kg", "kg", null],
  [6, "l", "l", "l", null], [11, "lb", "lbs", "pound", null], [5, "ml", "ml", "ml", null], [3, "oz", "oz", "ounce", null],
  [14, "pcs", "pcs", null, null], [18, "piece", "pieces", null, null], [4, "pinch", "pinches", "ml", null],
  [27, "pint carton", "pint cartons", null, "package"], [26, "quart carton", "quart cartons", null, "package"],
  [17, "stalk", "stalks", null, null], [8, "tbsp", "tbsp", "tbsp", null], [9, "tsp", "tsp", "tsp", null], [24, "tub", "tubs", null, "package"],
].map(([id, name, plural_name, base_unit, description]) => ({ id, name, plural_name, base_unit, description }));

// a slice of Tandoor's foods and aisles, as the catalog keeps them
export const cats = {
  produce: { id: 2, name: "Produce", description: null }, dairy: { id: 17, name: "Dairy", description: null },
  meat: { id: 4, name: "Meat", description: "by weight" }, canned: { id: 7, name: "Canned", description: null },
  spices: { id: 9, name: "Herbs and Spices", description: null }, household: { id: 30, name: "Household", description: null },
};
let foodId = 500;
const f = (name, cat, more = {}) => ({ id: foodId++, name, plural_name: null, ignore_shopping: false, supermarket_category: cat, ...more });
export const catalogFoods = [
  f("Onion, red", cats.produce), f("Onion, yellow", cats.produce), f("Onion powder", cats.spices), f("Avocado", cats.produce),
  f("Tomato, cherry", cats.produce), f("Tomato, Roma", cats.produce), f("Tomato, canned, diced", cats.canned),
  f("Milk, whole", cats.dairy), f("Milk, oat", cats.dairy), f("Egg", cats.dairy, { plural_name: "Eggs" }), f("Cream cheese", cats.dairy),
  f("Chicken, thigh", cats.meat), f("Chicken, breast", cats.meat), f("Peanut butter", cats.canned),
  f("Paper towels", cats.household), f("Water", cats.produce, { ignore_shopping: true }),
];
