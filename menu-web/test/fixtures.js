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
