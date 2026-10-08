// Reads the amount out of what's typed into the phone page's add box: "2 lb chicken thighs",
// "a dozen eggs", "1 1/2 lb ground beef", "half gallon whole milk", "2x cans tomatoes",
// "milk, 1 gallon", "eggs x12". Units are Tandoor's own (names and plurals, "-" and " " alike),
// plus the spoken words for a weight or volume base unit. Pure, so test/parse.test.js covers it.

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, half: 0.5, couple: 2, few: 3 };
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
// spoken words for a Tandoor base unit; the unit itself comes from the unit list
const SPOKEN = {
  pound: ["pound", "pounds", "lb", "lbs"], ounce: ["ounce", "ounces", "oz"], g: ["g", "gram", "grams"],
  kg: ["kg", "kilo", "kilos", "kilogram", "kilograms"], ml: ["ml", "milliliter", "milliliters"], l: ["l", "liter", "liters", "litre", "litres"],
};
const DOZEN = "dozen";
// alone this isn't an amount ("half and half"); it needs a unit or "dozen" after it
const NEED_UNIT = new Set(["half"]);

const phrase = s => s.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

/** Unit phrase -> Tandoor unit, longest phrases first. */
export function unitIndex(units) {
  const out = new Map();
  for (const u of units) for (const p of [u.name, u.plural_name]) if (p && p.trim() && !out.has(phrase(p))) out.set(phrase(p), u);
  // spoken words go to the unit that is itself called one of them ("lb" for pound), so a unit that
  // only shares the base (Tandoor's "pinch" is based on ml) never takes them
  for (const u of units) {
    const spoken = SPOKEN[u.base_unit?.trim().toLowerCase()] ?? [];
    if (!spoken.includes(phrase(u.name))) continue;
    for (const p of spoken) if (!out.has(p)) out.set(p, u);
  }
  return out;
}

const tokenize = text => text.replace(/(\d),(\d{3})\b/g, "$1$2").replace(/[½¼¾⅓⅔⅛]/g, c => ` ${FRACTIONS[c]} `)
  .replace(/(\d)\s*[x×](?=\s|$)/gi, "$1 x").replace(/(^|\s)[x×](\d)/gi, "$1x $2")
  .replace(/,/g, " , ").split(/\s+/).filter(Boolean);

/** A number at tokens[i]: digits, a fraction, "1 1/2", or (`words`) a number word. -> [value, next index] */
function number(tokens, i, words) {
  const t = tokens[i]?.toLowerCase();
  if (t == null) return null;
  const frac = s => { const m = /^(\d+)\/(\d+)$/.exec(s ?? ""); return m && +m[2] ? +m[1] / +m[2] : null; };
  if (/^\d+(\.\d+)?$/.test(t)) {
    const f = frac(tokens[i + 1]);
    return f != null ? [+t + f, i + 2] : (/^0?\.\d+$/.test(tokens[i + 1] ?? "") ? [+t + +tokens[i + 1], i + 2] : [+t, i + 1]);
  }
  if (frac(t) != null) return [frac(t), i + 1];
  if (words && t in NUMBER_WORDS) return [NUMBER_WORDS[t], i + 1];
  return null;
}

/** The longest unit phrase (up to 3 words) at tokens[i]. -> [unit, next index] */
function unitAt(tokens, i, index) {
  for (let n = 3; n >= 1; n--) {
    const u = index.get(phrase(tokens.slice(i, i + n).join(" ")));
    if (u && i + n <= tokens.length) return [u, i + n];
  }
  return null;
}

/** An amount starting at tokens[i]: number, "x", "dozen", unit, "of". -> {amount, unit, next} or null */
function amountAt(tokens, i, index, { words }) {
  const lead = words && unitAt(tokens, i, index); // "half gallon milk": a unit with no number in front is one of it
  if (lead) return { amount: 1, unit: lead[0], next: lead[1] };
  const n = number(tokens, i, words);
  if (!n) return null;
  let [amount, j] = n;
  let word = tokens[i].toLowerCase();
  // "a couple", "half a": the second word is the amount
  if (words && (word === "a" || word === "an") && ["couple", "few"].includes(tokens[j]?.toLowerCase())) { word = tokens[j].toLowerCase(); amount = NUMBER_WORDS[word] ?? 3; j++; }
  else if (word === "half" && ["a", "an"].includes(tokens[j]?.toLowerCase())) j++;
  if (tokens[j]?.toLowerCase() === "x") {
    j++;
    const each = number(tokens, j, false); // "6 x 1 lb butter": six of one pound
    if (each) { amount *= each[0]; j = each[1]; }
  }
  if (tokens[j]?.toLowerCase() === DOZEN) { amount *= 12; j++; }
  const u = unitAt(tokens, j, index);
  if (u) j = u[1];
  if (!u && NEED_UNIT.has(word) && tokens[j - 1]?.toLowerCase() !== DOZEN) return null;
  if (tokens[j]?.toLowerCase() === "of") j++;
  return { amount, unit: u ? u[0] : null, next: j };
}

const clean = tokens => tokens.join(" ").replace(/\s+,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "").trim();

/**
 * {amount, unit, rest}: the amount (or null), its Tandoor unit (or null) and the rest of the text.
 * The amount is read from the front, or from the back after a comma or "x" ("milk, 1 gallon").
 */
export function parseAmount(text, index) {
  const tokens = tokenize(text);
  const none = { amount: null, unit: null, rest: clean(tokens) };
  if (!tokens.length) return none;
  if (tokens[0].toLowerCase() === DOZEN && tokens.length > 1) return { amount: 12, unit: null, rest: clean(tokens.slice(1)) };
  const front = amountAt(tokens, 0, index, { words: true });
  if (front && front.next < tokens.length) return { amount: front.amount, unit: front.unit, rest: clean(tokens.slice(front.next)) };
  // from the back: a number running to the end, after a comma or "x", or with a unit ("juice box" stays a name)
  for (let i = 1; i < tokens.length; i++) {
    const sep = tokens[i - 1] === "," || tokens[i - 1].toLowerCase() === "x";
    const back = amountAt(tokens, i, index, { words: false });
    if (back && back.next === tokens.length && (sep || back.unit || /^\d/.test(tokens[i]))) {
      const restEnd = tokens[i - 1].toLowerCase() === "x" ? i - 1 : i;
      if (restEnd > 0) return { amount: back.amount, unit: back.unit, rest: clean(tokens.slice(0, restEnd)) };
    }
  }
  return none;
}
