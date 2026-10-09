// Tandoor's REST API, as the phone page uses it. The page is served at /shop/ on Tandoor's own
// address, so it signs in with the browser's Tandoor session (no token stored anywhere) and
// sends Django's CSRF cookie back on writes.

import { PACKAGE_MARKER, hasMarker, packagesFrom } from "./buy.js";

const failure = (kind, message) => Object.assign(new Error(message), { kind });

export const TIMEOUT_MS = 15_000; // a store's weak signal can leave a request hanging; treat that as offline

/** @param fetchFn fetch, injectable for tests; @param cookie () => document.cookie */
export function tandoorApi({ fetchFn = (...a) => fetch(...a), cookie = () => document.cookie, timeoutMs = TIMEOUT_MS } = {}) {
  async function call(path, init = {}) {
    let r;
    try {
      r = await fetchFn(path, { credentials: "same-origin", signal: AbortSignal.timeout(timeoutMs), ...init,
        headers: { Accept: "application/json", ...init.headers } });
    } catch (e) {
      throw failure("offline", e.message);
    }
    // a missing session (or the CSRF cookie a session brings) means signing in to Tandoor again
    if (r.status === 401 || r.status === 403 || (r.redirected && r.url.includes("/accounts/login"))) throw failure("signin", `HTTP ${r.status}`);
    if (!r.ok) throw Object.assign(failure("error", `HTTP ${r.status} for ${path}`), { status: r.status });
    return r.status === 204 ? null : r.json();
  }

  // pages by number: Tandoor's `next` links can carry the proxy's inner host name
  async function all(path) {
    const out = [];
    for (let page = 1; ; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await call(`${path}${sep}page_size=100&page=${page}`);
      out.push(...r.results);
      if (!r.next || !r.results.length) return out;
    }
  }

  // a write: JSON body plus Django's CSRF cookie, which comes with the Tandoor session
  function write(path, method, body) {
    const token = /(?:^|;\s*)csrftoken=([^;]+)/.exec(cookie())?.[1];
    if (!token) return Promise.reject(failure("signin", "no CSRF cookie"));
    return call(path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRFToken": decodeURIComponent(token) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const ref = x => x && { id: x.id, name: x.name };

  return {
    /** The list as Tandoor serves it by default (what the tablet shows). */
    listEntries: () => all("/api/shopping-list-entry/"),

    /**
     * What adding and changing items needs, fetched together with package sizes: {packages, units,
     * foods, categories}. Foods are cut down to what matching uses, so the saved copy stays small.
     */
    async loadCatalog() {
      const [units, foods, categories] = await Promise.all([all("/api/unit/"), all("/api/food/"), all("/api/supermarket-category/")]);
      const packed = units.filter(u => hasMarker(u.description, PACKAGE_MARKER));
      const rows = await Promise.all(packed.map(u => all(`/api/unit-conversion/?query=${encodeURIComponent(u.name)}`)));
      return {
        // a conversion row missing a unit is malformed (the app's parser would reject it); skip it, not the rest
        packages: packagesFrom(rows.flat().filter(c => c.base_unit && c.converted_unit)),
        units: units.map(({ id, name, plural_name, base_unit, description }) => ({ id, name, plural_name, base_unit, description })),
        foods: foods.map(f => ({ id: f.id, name: f.name, plural_name: f.plural_name ?? null, ignore_shopping: !!f.ignore_shopping,
          supermarket_category: f.supermarket_category && { id: f.supermarket_category.id, name: f.supermarket_category.name, description: f.supermarket_category.description ?? null } })),
        categories: categories.map(({ id, name, description }) => ({ id, name, description: description ?? null })),
      };
    },

    /** Set these entries checked or unchecked (an absolute value, never a toggle). */
    setChecked: (ids, checked) => write("/api/shopping-list-entry/bulk/", "POST", { ids, checked }),

    /** A new aisle. */
    addCategory: name => write("/api/supermarket-category/", "POST", { name }),

    /** A new food in an aisle. */
    addFood: (name, category) => write("/api/food/", "POST", { name, supermarket_category: ref(category) }),

    /** A list entry; `listRecipe` files it under a shopping-list group (edit.js uses one for changes). */
    addEntry: ({ food, amount, unit = null, listRecipe = null }) =>
      write("/api/shopping-list-entry/", "POST", { food: ref(food), amount, unit: ref(unit), checked: false, ...(listRecipe ? { list_recipe: listRecipe } : {}) }),

    /**
     * A change entry's new amount; its food and unit stay as they are. `checked` must be sent:
     * Tandoor un-ticks (and hides) an entry whose update leaves it out.
     */
    setAmount: (id, amount, checked) => write(`/api/shopping-list-entry/${id}/`, "PATCH", { amount, checked }),

    removeEntry: id => write(`/api/shopping-list-entry/${id}/`, "DELETE"),

    /** The shopping-list group changes are filed under (a group with a name and no recipe). */
    addEditList: name => write("/api/shopping-list-recipe/", "POST", { name, servings: 1 }),

    /** Delete that group and every entry in it. */
    removeEditList: id => write(`/api/shopping-list-recipe/${id}/`, "DELETE"),
  };
}
