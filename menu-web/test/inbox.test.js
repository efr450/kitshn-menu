import assert from "node:assert/strict";
import { test } from "node:test";
import { Draft, appBridge, inboxApi, keyBytes, nextActions, pill, progress, recipeIdOf, sharedLink } from "../public/inbox.js";

test("a shared link comes from url, else the first link in the shared text", () => {
  assert.equal(sharedLink(new URLSearchParams({ url: "https://a.test/r" })), "https://a.test/r");
  assert.equal(sharedLink(new URLSearchParams({ text: "Make this! https://b.test/x?y=1)." })), "https://b.test/x?y=1");
  assert.equal(sharedLink(new URLSearchParams({ title: "Soup", text: "no link" })), null);
});

test("the pill says where a job is", () => {
  assert.equal(pill({ state: "running", stage: "writing" }).text, "Writing the recipe…");
  assert.deepEqual(pill({ state: "ask", questions: 1, preview_ready: false }), { text: "1 quick question", kind: "ask" });
  assert.equal(pill({ state: "ask", questions: 3, preview_ready: true }).text, "Preview ready · tap");
  assert.equal(pill({ state: "failed" }).kind, "bad");
  assert.ok(progress({ state: "running", stage: "checking" }) > progress({ state: "running", stage: "reading" }));
});

test("a draft walks the questions in order and builds the reply", () => {
  const qs = [{ id: "gf" }, { id: "food" }];
  const d = new Draft();
  assert.equal(d.next(qs).id, "gf");
  d.answer("gf", "Keep as is");
  assert.equal(d.next(qs).id, "food");
  d.answer("food", "Spice, za'atar");
  assert.equal(d.next(qs), null);
  d.comment("step 2", "  flip halfway ");
  d.comment("photo", "   ");
  assert.deepEqual(d.body("revise"), { action: "revise", answers: { gf: "Keep as is", food: "Spice, za'atar" }, comments: [{ part: "step 2", text: "flip halfway" }] });
});

test("what the dock offers depends on the mode and on notes", () => {
  const d = new Draft();
  assert.deepEqual(nextActions({ state: "ask", preview: false }, d).map(a => a.action), ["add"]);
  assert.deepEqual(nextActions({ state: "ask", preview: true }, d).map(a => a.action), ["add"]);
  d.comment("step 1", "shorter");
  assert.deepEqual(nextActions({ state: "ask", preview: true }, d).map(a => a.action), ["revise", "add"]);
  assert.deepEqual(nextActions({ state: "done" }, d).map(a => a.action), ["change"]);
  assert.deepEqual(nextActions({ state: "done" }, new Draft()), []);
  assert.deepEqual(nextActions({ state: "running" }, d), []);
});

test("the API posts JSON and turns a missing session into a sign-in", async () => {
  const calls = [];
  const api = inboxApi({ fetchFn: async (url, init) => { calls.push([url, init]); return { ok: true, status: 201, json: async () => ({ id: "x" }) }; } });
  await api.add("https://a.test/r", "look");
  assert.equal(calls[0][0], "/shop/api/inbox/jobs");
  assert.equal(calls[0][1].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0][1].body), { url: "https://a.test/r", mode: "look" });
  const out = inboxApi({ fetchFn: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await assert.rejects(out.jobs(), e => e.kind === "signin");
  const down = inboxApi({ fetchFn: async () => { throw new Error("net"); } });
  await assert.rejects(down.jobs(), e => e.kind === "offline");
});

test("the VAPID key decodes from base64url", () => {
  assert.deepEqual([...keyBytes("AQID_-8")], [1, 2, 3, 255, 239]);
});

test("inside the Menu app the API sends the app's token", async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push(init); return { ok: true, status: 200, json: async () => ({ jobs: [] }) }; };
  await inboxApi({ fetchFn, bridge: { token: () => "abc", openRecipe() {} } }).jobs();
  assert.equal(calls[0].headers.Authorization, "Bearer abc");
  await inboxApi({ fetchFn, bridge: null }).jobs();
  assert.equal(calls[1].headers.Authorization, undefined);
  await assert.rejects(inboxApi({ fetchFn, bridge: { token: () => null, openRecipe() {} } }).jobs(), e => e.kind === "signin");
  assert.equal(calls.length, 2);
});

test("the app bridge needs both calls; recipe ids come from Tandoor links", () => {
  assert.equal(appBridge({}), null);
  assert.equal(appBridge({ MenuApp: { token: () => "t" } }), null);
  assert.ok(appBridge({ MenuApp: { token: () => "t", openRecipe() {} } }));
  assert.equal(recipeIdOf("https://server.tail2d7086.ts.net/recipe/29/"), 29);
  assert.equal(recipeIdOf("http://server.home/recipe/7"), 7);
  assert.equal(recipeIdOf("https://server.tail2d7086.ts.net/recipe/29/?x=1"), 29);
  assert.equal(recipeIdOf("https://site.test/recipe/29-chili-tofu/"), null);
  assert.equal(recipeIdOf(undefined), null);
});
