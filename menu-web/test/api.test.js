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

const lists = ({ units = [], foods = [], categories = [], conversions = () => [] }) => async url => {
  if (url.startsWith("/api/unit/")) return json({ results: units, next: null });
  if (url.startsWith("/api/food/")) return json({ results: foods, next: null });
  if (url.startsWith("/api/supermarket-category/")) return json({ results: categories, next: null });
  assert.ok(url.startsWith("/api/unit-conversion/?query="), url);
  return json({ results: conversions(url), next: null });
};

test("package sizes come from units marked package and their conversions", async () => {
  const g = { id: 13, name: "g", base_unit: "g" };
  const hg = { id: 19, name: "half-gallon", plural_name: "half-gallons", description: "package" };
  const api = tandoorApi({ fetchFn: lists({ units: [g, hg, { id: 12, name: "cup", description: null }], conversions: url => {
    assert.ok(url.includes("query=half-gallon"), url);
    return [{ id: 1, food: { name: "Milk, whole" }, base_amount: 1, base_unit: hg, converted_amount: 1992, converted_unit: g }];
  } }) });
  assert.deepEqual((await api.loadCatalog()).packages, { "milk, whole": { name: "half-gallon", pluralName: "half-gallons", grams: 1992 } });
});

test("the catalog keeps only what matching needs from foods, units and aisles", async () => {
  const dairy = { id: 17, name: "Dairy", description: null, open_data_slug: "x" };
  const api = tandoorApi({ fetchFn: lists({
    units: [{ id: 13, name: "g", plural_name: "g", base_unit: "g", description: null, open_data_slug: "u" }],
    foods: [{ id: 54, name: "Milk, whole", plural_name: null, ignore_shopping: false, supermarket_category: dairy, properties: [1, 2], recipe: null }],
    categories: [dairy],
  }) });
  const c = await api.loadCatalog();
  assert.deepEqual(c.foods, [{ id: 54, name: "Milk, whole", plural_name: null, ignore_shopping: false, supermarket_category: { id: 17, name: "Dairy", description: null } }]);
  assert.deepEqual(c.units, [{ id: 13, name: "g", plural_name: "g", base_unit: "g", description: null }]);
  assert.deepEqual(c.categories, [{ id: 17, name: "Dairy", description: null }]);
});

test("adding and changing items write with the CSRF cookie: entries, foods, aisles, the change group", async () => {
  const sent = [];
  const api = tandoorApi({ fetchFn: async (url, init) => { sent.push([init.method, url, init.body && JSON.parse(init.body), init.headers["X-CSRFToken"]]);
    return init.method === "DELETE" ? { ok: true, status: 204, redirected: false, url: "", json: async () => { throw new Error("no body"); } } : json({ id: 9 }); },
    cookie: () => "csrftoken=t" });
  const food = { id: 54, name: "Milk, whole", plural_name: null };
  const g = { id: 13, name: "g", base_unit: "g" };
  await api.addEntry({ food, amount: 900, unit: g, listRecipe: 7 });
  await api.addEntry({ food, amount: 0 });
  await api.setAmount(3, -120, true);
  assert.equal(await api.removeEntry(3), null);
  await api.addFood("Chicken, drumstick", { id: 4, name: "Meat", description: "by weight" });
  await api.addCategory("Household");
  await api.addEditList("Changed by hand");
  await api.removeEditList(77);
  assert.deepEqual(sent, [
    ["POST", "/api/shopping-list-entry/", { food: { id: 54, name: "Milk, whole" }, amount: 900, unit: { id: 13, name: "g" }, checked: false, list_recipe: 7 }, "t"],
    ["POST", "/api/shopping-list-entry/", { food: { id: 54, name: "Milk, whole" }, amount: 0, unit: null, checked: false }, "t"],
    ["PATCH", "/api/shopping-list-entry/3/", { amount: -120, checked: true }, "t"],
    ["DELETE", "/api/shopping-list-entry/3/", undefined, "t"],
    ["POST", "/api/food/", { name: "Chicken, drumstick", supermarket_category: { id: 4, name: "Meat" } }, "t"],
    ["POST", "/api/supermarket-category/", { name: "Household" }, "t"],
    ["POST", "/api/shopping-list-recipe/", { name: "Changed by hand", servings: 1 }, "t"],
    ["DELETE", "/api/shopping-list-recipe/77/", undefined, "t"],
  ]);
});

test("a request that hangs counts as offline", async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  await assert.rejects(tandoorApi({ fetchFn: hang, timeoutMs: 20 }).listEntries(), e => e.kind === "offline");
});

test("a conversion row missing a unit is skipped, not fatal", async () => {
  const g = { name: "g", base_unit: "g" };
  const can = { name: "can", plural_name: "cans", description: "package" };
  const api = tandoorApi({ fetchFn: lists({ units: [can], conversions: () => [
    { id: 1, food: { name: "Beans" }, base_amount: 1, base_unit: null, converted_amount: 400, converted_unit: g },
    { id: 2, food: { name: "Tomato" }, base_amount: 1, base_unit: can, converted_amount: 400, converted_unit: g },
  ] }) });
  assert.deepEqual(Object.keys((await api.loadCatalog()).packages), ["tomato"]);
});
