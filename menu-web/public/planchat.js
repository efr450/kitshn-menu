// Menu fork: the Plan chat's rules (plan/plan.js draws them). Ethan or Lindsay chats with Claude at
// home about what to eat; Claude changes the Meal Plan and shopping list, and each change shows as a
// chip with Undo. The server lives in the Menu repo (importer/menu_import/plan_chat.py), behind the
// inbox server at /shop/api/inbox/plan. Both people sign in with the same Tandoor account, so each
// device remembers who is typing.

import { inboxCaller } from "./inbox.js";

export const WHO_KEY = "menu.plan.who";
export const STARTERS = ["Plan dinners for the next few days", "What sounds good this week?", "What's on the plan?",
  "What can we make with what we have?"];

/** The Plan chat's API. Same options as inboxApi. */
export function planApi(opts = {}) {
  const { call, post } = inboxCaller(opts);
  const chat = id => `/plan/chats/${encodeURIComponent(id)}`;
  return {
    home: () => call("/plan"),
    newChat: () => post("/plan/chats", {}),
    /** The chat; with a version, waits (up to ~20 s) until it differs. */
    chat: (id, version, after, signal) => call(chat(id) + (version == null ? "" : `?v=${version}&after=${after || 0}`), { signal }),
    send: (id, who, text) => post(chat(id) + "/messages", { who, text }),
    undo: (id, seq, who) => post(chat(id) + "/undo", { seq, who }),
    /** Yes or no on a confirm card (hand a link to the recipe adder, save a profile note). */
    confirm: (id, seq, who, yes) => post(chat(id) + "/confirm", { seq, who, yes }),
    profiles: () => call("/plan/profiles"),
    saveProfile: (key, text) => post("/plan/profiles", { key, text }),
  };
}

/** The person this device last typed as, if they're still one of the people. */
export function pickWho(stored, people) {
  return people.some(p => p.key === stored) ? stored : null;
}

/** Items by seq: new ones added, changed ones (an undone chip, an adder's state) replaced. */
export function merge(items, incoming) {
  const bySeq = new Map(items.map(i => [i.seq, i]));
  for (const i of incoming) bySeq.set(i.seq, i);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * Claude's text as blocks to draw: {type: "p" | "li", parts: [{text, bold}]}. Only what replies
 * use: paragraphs, "- " or "1. " list lines and **bold**. Never HTML, so nothing in a reply runs.
 */
export function blocks(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const li = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    const body = (li ? li[1] : line).replace(/^#{1,6}\s+/, "");
    const parts = body.split(/\*\*(.+?)\*\*/g).map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter(p => p.text);
    out.push({ type: li ? "li" : "p", parts });
  }
  return out;
}

/** The buttons on a confirm card, by what Claude offered. */
export function confirmLabels(item) {
  return item.action === "adder" ? { yes: "Add it", no: "Not now" } : { yes: "Save", no: "Don't save" };
}

/** What an adder card says about its import. */
export function adderLabel(item) {
  return { queued: "Waiting its turn", running: "Adding it to Menu…", ask: "Needs you in Add/Monitor",
    done: "✓ Added to Menu", failed: "Couldn't add it" }[item.state] || "Sent to the recipe adder";
}

/** The servings note on a plan card meal: "4 servings", or "leftovers" on the nights after cooking. */
export function mealNote(meal) {
  if (meal.leftover) return "leftovers";
  const n = Number(meal.servings) || 0;
  return meal.recipe_id ? `${n % 1 ? n.toFixed(1) : n} servings` : "note";
}
