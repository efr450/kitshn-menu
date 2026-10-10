import assert from "node:assert/strict";
import { test } from "node:test";
import { adderLabel, blocks, confirmLabels, mealNote, merge, pickWho, planApi } from "../public/planchat.js";

const people = [{ key: "ethan", name: "Ethan" }, { key: "lindsay", name: "Lindsay" }];

test("a device keeps who typed last, if they're still one of the people", () => {
  assert.equal(pickWho("lindsay", people), "lindsay");
  assert.equal(pickWho("bob", people), null);
  assert.equal(pickWho(null, people), null);
});

test("merge adds new items and replaces changed ones, in seq order", () => {
  const a = [{ seq: 1, text: "hi" }, { seq: 2, kind: "change", undone: false }];
  const out = merge(a, [{ seq: 3, text: "new" }, { seq: 2, kind: "change", undone: true }]);
  assert.deepEqual(out.map(i => i.seq), [1, 2, 3]);
  assert.equal(out[1].undone, true);
});

test("Claude's text becomes paragraphs, list lines and bold, never HTML", () => {
  assert.deepEqual(blocks("Two ideas:\n\n- **Tacos**: quick\n2. Soup <b>x</b>\n## Head"), [
    { type: "p", parts: [{ text: "Two ideas:", bold: false }] },
    { type: "li", parts: [{ text: "Tacos", bold: true }, { text: ": quick", bold: false }] },
    { type: "li", parts: [{ text: "Soup <b>x</b>", bold: false }] },
    { type: "p", parts: [{ text: "Head", bold: false }] },
  ]);
  assert.deepEqual(blocks(""), []);
  assert.deepEqual(blocks("I found [Averie's **Skillet**](https://a.test/s) for Wed. [x](javascript:alert(1))"), [
    { type: "p", parts: [{ text: "I found ", bold: false }, { text: "Averie's Skillet", bold: false, href: "https://a.test/s" },
      { text: " for Wed. ", bold: false }, { text: "x", bold: false }] },
  ]);
  assert.deepEqual(blocks("[Chili](https://w.test/wiki/Chili_(food)) ok")[0].parts,
    [{ text: "Chili", bold: false, href: "https://w.test/wiki/Chili_(food)" }, { text: " ok", bold: false }]);
  assert.deepEqual(blocks("Tap Add.\n\nSources:\n- [Averie Cooks](https://a.test/s)\n- [B](https://b.test)"),
    [{ type: "p", parts: [{ text: "Tap Add.", bold: false }] }]);
});

test("plan card notes and adder states read plainly", () => {
  assert.equal(mealNote({ recipe_id: 4, servings: 6 }), "6 servings");
  assert.equal(mealNote({ recipe_id: 4, servings: 1.5 }), "1.5 servings");
  assert.equal(mealNote({ recipe_id: 4, servings: 6, leftover: true }), "leftovers");
  assert.equal(mealNote({ recipe_id: null, servings: 1 }), "note");
  assert.equal(adderLabel({ state: "done" }), "✓ Added to Menu");
  assert.equal(adderLabel({ state: "weird" }), "Sent to the recipe adder");
  assert.deepEqual(confirmLabels({ action: "adder" }), { yes: "Add it", no: "Not now" });
  assert.deepEqual(confirmLabels({ action: "remember" }), { yes: "Save", no: "Don't save" });
});

test("the API long-polls with the version and posts who typed", async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push([url, init.method || "GET", init.body]); return { ok: true, status: 200, json: async () => ({}) }; };
  const api = planApi({ fetchFn, bridge: null });
  await api.chat("1010-1", 7, 12);
  await api.chat("1010-1");
  await api.send("1010-1", "ethan", "tacos?");
  await api.undo("1010-1", 3, "lindsay");
  await api.confirm("1010-1", 4, "ethan", false);
  assert.deepEqual(calls.map(c => c[0]), ["/shop/api/inbox/plan/chats/1010-1?v=7&after=12", "/shop/api/inbox/plan/chats/1010-1",
    "/shop/api/inbox/plan/chats/1010-1/messages", "/shop/api/inbox/plan/chats/1010-1/undo", "/shop/api/inbox/plan/chats/1010-1/confirm"]);
  assert.deepEqual(JSON.parse(calls[4][2]), { seq: 4, who: "ethan", yes: false });
  assert.deepEqual(JSON.parse(calls[2][2]), { who: "ethan", text: "tacos?" });
  assert.deepEqual(JSON.parse(calls[3][2]), { seq: 3, who: "lindsay" });
});

test("home being down reads as such, not as an HTTP code", async () => {
  const api = planApi({ fetchFn: async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }), bridge: null });
  await assert.rejects(api.home(), { kind: "error", message: "Can't reach home right now. Try again in a moment." });
});
