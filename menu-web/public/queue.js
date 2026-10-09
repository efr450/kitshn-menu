// Adds typed with no signal. They wait on the phone (store), show on the list as "waiting to send"
// rows, and go to Tandoor in the order they were typed once it answers, through actions.js's addItem.
//
// - A waiting add can be ticked or swiped away on the phone. A ticked one is never sent: it was
//   bought before Tandoor heard of it, so there's nothing left to put on the list.
// - A food that's new to Tandoor is made once: a second waiting add of the same name reuses it.
// - No signal (or a sign-in) stops the send and keeps the rest. Tandoor down (5xx) keeps it for a
//   later try, up to GIVE_UP_AFTER; Tandoor refusing it (4xx) drops it.
// - A try that timed out may still have reached Tandoor, so before trying again it looks for the
//   entry on the list (same food and amount, made since the add was typed) and counts it as sent.
//
// `store` is injected, so test/queue.test.js drives this with a fake. app.js only draws.

import { addItem, storedAmount } from "./actions.js";

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const GIVE_UP_AFTER = 3;

export class AddQueue {
  /** @param store {load() -> items | null, save(items) -> boolean} */
  constructor({ store }) {
    this.store = store;
    // {qid, food: a Tandoor food, or {name, aisle} for a new one, amount, unit, checked, at, tried, fails}
    this.items = [];
    this.next = 1;
  }

  load() {
    this.items = this.store.load() || [];
    this.next = Math.max(0, ...this.items.map(i => i.qid)) + 1;
  }

  /** Whether the phone kept it: the waiting adds exist nowhere else. */
  save() { return this.store.save(this.items) !== false; }

  /**
   * Keep an add for later; returns whether the phone stored it. `food`, `amount` and `unit` are as
   * addItem takes them; `tried`: a send was already attempted (and may have reached Tandoor).
   */
  push({ food, amount, unit, tried = false }) {
    this.items.push({ qid: this.next++, food, amount: amount ?? null, unit: unit ?? null, checked: false, at: Date.now(), tried, fails: 0 });
    return this.save();
  }

  /** Tick or untick waiting adds (by the ids asEntries gave them). */
  set(ids, checked) {
    for (const i of this.items) if (ids.includes(qidKey(i.qid))) i.checked = checked;
    this.save();
  }

  remove(ids) {
    this.items = this.items.filter(i => !ids.includes(qidKey(i.qid)));
    this.save();
  }

  get length() { return this.items.length; }

  /**
   * The waiting adds as Tandoor-shaped entries, so list.js draws them like the rest: a known food
   * joins its row, a new one gets a row in its aisle (Other when it has none). Their ids are strings.
   */
  asEntries(units) {
    return this.items.map(i => {
      const food = i.food.id != null ? i.food
        : { id: `new:${i.food.name.trim().toLowerCase()}`, name: i.food.name, plural_name: null, supermarket_category: aisleOf(i.food.aisle) };
      const amt = i.amount == null ? { amount: 0, unit: null } : storedAmount(i.amount, i.unit, units);
      return { id: qidKey(i.qid), food, ...amt, checked: i.checked, waiting: true };
    });
  }

  /**
   * Send the waiting adds in order. `entries()` and `catalog()` give the list and catalog now;
   * `onSent` runs after each, so the next one plans from a list that has it. `skip(id)` holds an add
   * back (one swiped away, waiting out Undo). Returns {sent, dropped: [food names Tandoor refused],
   * stopped: null | "offline" | "signin" | "error"}.
   */
  async send(api, { entries, catalog, onSent = async () => {}, skip = () => false }) {
    const made = new Map(); // food names sent or made during this send -> the food
    const out = { sent: 0, dropped: [], stopped: null };
    for (;;) {
      const i = this.items.find(x => !skip(qidKey(x.qid)));
      if (!i) return out;
      if (i.checked) { this.drop(i); continue; }
      let food = i.food;
      if (food.id == null) {
        food = made.get(food.name.trim().toLowerCase()) ?? catalog().foods.find(f => same(f.name, food.name))
          // made by an earlier send that then stopped, before the catalog caught up
          ?? this.items.find(o => o.food.id != null && same(o.food.name, food.name))?.food ?? food;
      }
      if (food.id != null) {
        made.set(food.name.trim().toLowerCase(), food);
        if (i.food !== food) { i.food = food; this.save(); }
      }
      if (i.tried && landed(entries(), i, catalog().units)) { this.drop(i); out.sent++; continue; }
      i.tried = true;
      this.save();
      try {
        await addItem(api, { food, amount: i.amount, unit: i.unit, entries: entries(), catalog: catalog(),
          // kept on the item too: if the entry then fails, the retry mustn't make the food again
          onFood: f => { made.set(f.name.trim().toLowerCase(), f); i.food = f; this.save(); } });
      } catch (e) {
        if (e.kind === "offline" || e.kind === "signin") { out.stopped = e.kind; return out; }
        if (!(e.status < 500) && ++i.fails < GIVE_UP_AFTER) { this.save(); out.stopped = "error"; return out; }
        out.dropped.push(i.food.name);
        this.drop(i);
        continue;
      }
      this.drop(i);
      out.sent++;
      await onSent();
    }
  }

  // by identity: the list may have been changed (an add swiped away) while a send was out
  drop(i) {
    this.items = this.items.filter(x => x !== i);
    this.save();
  }
}

// a timed-out try that reached Tandoor: an unticked entry of that food and amount made since the add was typed
function landed(entries, i, units) {
  if (i.food.id == null) return false;
  const want = i.amount == null ? { amount: 0, unit: null } : storedAmount(i.amount, i.unit, units);
  return entries.some(e => e.food?.id === i.food.id && !e.checked && Math.abs(e.amount - want.amount) < 1e-6
    && (e.unit?.id ?? null) === (want.unit?.id ?? null) && Date.parse(e.created_at) >= (i.at ?? 0) - 60_000);
}

export const qidKey = qid => `q${qid}`;
export const isWaiting = id => typeof id === "string" && /^q\d+$/.test(id);

// a new food's aisle as list.js reads it: a category, a new aisle's name, or none (Other)
const aisleOf = a => a == null ? null : typeof a === "string" ? { id: `new:${a}`, name: a.trim(), description: null } : a;
