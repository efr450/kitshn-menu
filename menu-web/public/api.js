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
    if (!r.ok) throw failure("error", `HTTP ${r.status} for ${path}`);
    return r.json();
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

  return {
    /** The list as Tandoor serves it by default (what the tablet shows). */
    listEntries: () => all("/api/shopping-list-entry/"),

    /** Package sizes, the same way the app's TandoorUnitConversionRoute.loadPackages() reads them. */
    async loadPackages() {
      const units = (await all("/api/unit/")).filter(u => hasMarker(u.description, PACKAGE_MARKER));
      const rows = await Promise.all(units.map(u => all(`/api/unit-conversion/?query=${encodeURIComponent(u.name)}`)));
      // a row missing a unit is malformed (the app's parser would reject it); skip it, not the rest
      return packagesFrom(rows.flat().filter(c => c.base_unit && c.converted_unit));
    },

    /** Set these entries checked or unchecked (an absolute value, never a toggle). */
    setChecked(ids, checked) {
      const token = /(?:^|;\s*)csrftoken=([^;]+)/.exec(cookie())?.[1];
      if (!token) return Promise.reject(failure("signin", "no CSRF cookie"));
      return call("/api/shopping-list-entry/bulk/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": decodeURIComponent(token) },
        body: JSON.stringify({ ids, checked }),
      });
    },
  };
}
