// Matches what's typed into the phone page's add box against Tandoor's foods, and says what a new
// food would be called and where it goes. The rules are the importer's (Menu repo, foods.py):
// a food is "Head, specifics" ("Onion, red"), and a new food goes to the aisle every food with its
// head is in; a head split across aisles (Tomato: Produce and Canned) is the shopper's call.
// Everything comes from Tandoor's own foods and aisles, so each food added teaches the next match.
// Pure, so test/foods.test.js covers it.

/** "Tomatoes," -> "tomato": plural endings off, for matching only. */
export function singular(word) {
  if (word.length <= 3 || word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word; // citrus, hummus, hibiscus
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes") || word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes")) return word.slice(0, -2);
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

export const words = text => text.toLowerCase().replace(/[,()]/g, " ").split(/\s+/).filter(Boolean);
const key = text => words(text).map(singular).sort().join(" ");
const headOf = name => name.split(",")[0].trim();

/**
 * What matching needs from Tandoor's foods: [{food, keys, words, head, ignored}]. Foods never bought
 * (ignore_shopping) still match exactly, since Tandoor won't make a second food of the same name,
 * but aren't suggested and don't decide aisles.
 */
export function foodIndex(foods) {
  return foods.filter(f => f.name?.trim()).map(f => ({
    ignored: !!f.ignore_shopping,
    food: f,
    keys: [f.name, f.plural_name].filter(n => n && n.trim()).map(key),
    words: words(f.name).map(singular),
    head: headOf(f.name).toLowerCase(),
  }));
}

/** The food these words name, ignoring plurals, commas and word order ("red onions" is Onion, red). */
export function exactFood(text, index) {
  const k = key(text);
  return k ? index.find(i => i.keys.includes(k))?.food ?? null : null;
}

/**
 * Autocomplete: foods where every typed word starts one of the food's words, best first (exact
 * name, then more whole words, then the head typed first, then foods in `prefer` (ids: what's on
 * the list), then shorter names).
 */
export function suggestFoods(text, index, limit = 5, prefer = new Set()) {
  const typed = words(text).map(singular);
  if (!typed.length) return [];
  const k = typed.slice().sort().join(" ");
  const hits = [];
  for (const i of index) {
    if (i.ignored || !typed.every(t => i.words.some(w => w.startsWith(t)))) continue;
    const score = (i.keys.includes(k) ? 1000 : 0) + typed.filter(t => i.words.includes(t)).length * 10
      + (i.words[0].startsWith(typed[0]) ? 5 : 0) + (prefer.has(i.food.id) ? 3 : 0) - i.words.length;
    hits.push({ food: i.food, exact: i.keys.includes(k), score });
  }
  return hits.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name)).slice(0, limit);
}

/** True while the last word is still being typed toward a suggestion ("avo"), so it isn't new yet. */
export function stillTyping(text, suggestions) {
  const last = singular(words(text).pop() ?? "");
  return suggestions.length > 0 && !suggestions.some(s => words(s.food.name).map(singular).includes(last));
}

/** Aisle id -> how many foods are in it, from the food list. */
function aisleCounts(index, filter = () => true) {
  const out = new Map();
  for (const i of index) {
    const c = i.food.supermarket_category;
    if (c && !i.ignored && filter(i)) out.set(c.id, (out.get(c.id) ?? 0) + 1);
  }
  return out;
}

/** Every aisle, busiest first: the order the aisle chips are offered in. */
export function aisleOrder(index, categories) {
  const n = aisleCounts(index);
  return [...categories].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0) || a.name.localeCompare(b.name));
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A food that isn't in Tandoor yet: {name, aisle, guesses}. `aisle` is set when it's obvious (a new
 * kind of a head whose foods all share one aisle); otherwise `guesses` lists likely aisles, best first.
 *  - "chicken drumsticks" -> Chicken, drumstick in Meat
 *  - "diced tomatoes" -> Tomato, diced; guesses Produce, Canned (Tomato foods are in both)
 *  - "paper napkins" -> Paper napkins; guesses the aisles of foods sharing a word (Paper towels: Household)
 */
export function proposeFood(text, index, categories) {
  const typed = words(text);
  const sing = typed.map(singular);
  const byId = new Map(categories.map(c => [c.id, c]));
  const ranked = counts => [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)).filter(Boolean);

  // the longest head (one or more words) found in what was typed, with something left over
  const heads = new Map();
  for (const i of index) if (!i.ignored && !heads.has(i.head)) heads.set(i.head, headOf(i.food.name));
  let best = null;
  for (const [h, display] of heads) {
    const hw = words(h).map(singular);
    for (let s = 0; s + hw.length <= sing.length; s++) {
      if (hw.every((w, j) => sing[s + j] === w) && sing.length > hw.length && (!best || hw.length > best.hw.length)) best = { h, display, hw, s };
    }
  }
  if (best) {
    const rest = sing.filter((_, j) => j < best.s || j >= best.s + best.hw.length);
    const aisles = ranked(aisleCounts(index, i => i.head === best.h));
    const name = `${best.display}, ${rest.join(" ")}`;
    // a number left in the name ("Lime, three") means the amount wasn't understood: ask, don't guess
    const sure = aisles.length === 1 && !/\d/.test(name);
    return sure ? { name, aisle: aisles[0], guesses: [] } : { name, aisle: null, guesses: aisles };
  }
  const shared = aisleCounts(index, i => i.words.some(w => sing.includes(w)));
  return { name: cap(typed.join(" ")), aisle: null, guesses: ranked(shared).slice(0, 3) };
}
