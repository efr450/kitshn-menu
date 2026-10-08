import assert from "node:assert/strict";
import { test } from "node:test";
import { tandoorApi } from "../public/api.js";

const json = (body, status = 200) => ({ ok: status < 400, status, redirected: false, url: "", json: async () => body });

test("lists every page by number, ignoring Tandoor's next links", async () => {
  const seen = [];
  const api = tandoorApi({
    fetchFn: async url => {
      seen.push(url);
      return url.includes("page=1") ? json({ results: [{ id: 1 }], next: "http://localhost/api/x?page=2" }) : json({ results: [{ id: 2 }], next: null });
    },
  });
  assert.deepEqual((await api.listEntries()).map(e => e.id), [1, 2]);
  assert.deepEqual(seen, ["/api/shopping-list-entry/?page_size=100&page=1", "/api/shopping-list-entry/?page_size=100&page=2"]);
});

test("ticks go to Tandoor's bulk endpoint as an absolute value with the CSRF cookie", async () => {
  let sent;
  const api = tandoorApi({ fetchFn: async (url, init) => { sent = { url, init }; return json({}); }, cookie: () => "a=1; csrftoken=t%2Bk; b=2" });
  await api.setChecked([4, 5], true);
  assert.equal(sent.url, "/api/shopping-list-entry/bulk/");
  assert.equal(sent.init.method, "POST");
  assert.equal(sent.init.headers["X-CSRFToken"], "t+k");
  assert.deepEqual(JSON.parse(sent.init.body), { ids: [4, 5], checked: true });
});

test("failures say what kind they are", async () => {
  const kind = async (fetchFn, cookie = () => "csrftoken=x") => {
    try { await tandoorApi({ fetchFn, cookie }).setChecked([1], true); } catch (e) { return e.kind; }
    return "none";
  };
  assert.equal(await kind(async () => { throw new TypeError("Failed to fetch"); }), "offline");
  assert.equal(await kind(async () => json({}, 403)), "signin");
  assert.equal(await kind(async () => ({ ...json({}), redirected: true, url: "https://x/accounts/login/?next=/" })), "signin");
  assert.equal(await kind(async () => json({}, 500)), "error");
  assert.equal(await kind(async () => json({}), () => ""), "signin");
});

test("package sizes come from units marked package and their conversions", async () => {
  const g = { name: "g", base_unit: "g" };
  const hg = { name: "half-gallon", plural_name: "half-gallons", description: "package" };
  const api = tandoorApi({
    fetchFn: async url => {
      if (url.startsWith("/api/unit/")) return json({ results: [g, hg, { name: "cup", description: null }], next: null });
      assert.ok(url.startsWith("/api/unit-conversion/?query=half-gallon"), url);
      return json({ results: [{ id: 1, food: { name: "Milk, whole" }, base_amount: 1, base_unit: hg, converted_amount: 1992, converted_unit: g }], next: null });
    },
  });
  assert.deepEqual(await api.loadPackages(), { "milk, whole": { name: "half-gallon", pluralName: "half-gallons", grams: 1992 } });
});

test("a request that hangs counts as offline", async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  await assert.rejects(tandoorApi({ fetchFn: hang, timeoutMs: 20 }).listEntries(), e => e.kind === "offline");
});

test("a conversion row missing a unit is skipped, not fatal", async () => {
  const g = { name: "g", base_unit: "g" };
  const can = { name: "can", plural_name: "cans", description: "package" };
  const api = tandoorApi({
    fetchFn: async url => url.startsWith("/api/unit/") ? json({ results: [can], next: null }) : json({ results: [
      { id: 1, food: { name: "Beans" }, base_amount: 1, base_unit: null, converted_amount: 400, converted_unit: g },
      { id: 2, food: { name: "Tomato" }, base_amount: 1, base_unit: can, converted_amount: 400, converted_unit: g },
    ], next: null }),
  });
  assert.deepEqual(Object.keys(await api.loadPackages()), ["tomato"]);
});
