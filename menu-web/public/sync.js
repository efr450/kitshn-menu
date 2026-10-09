// Keeps the phone page and Tandoor in step. Tandoor holds the only list; this holds the last copy
// fetched (for offline) and the ticks not yet confirmed.
//
// - A tick is stored as "these entries are checked" (or unchecked), never as "flip them", so
//   sending it twice can't invert anything.
// - Unconfirmed ticks are drawn over the fetched list. A tick stays drawn after Tandoor accepts it
//   until a refresh that *started* after that, so an older in-flight fetch can't undo it on screen.
// - Ticks survive closing the page (store). Ones Tandoor never accepted are sent on the next start;
//   accepted ones are only waited out, never re-sent, so a later change on the tablet isn't overwritten.
// - Refresh answers are applied in the order the refreshes started; a late, older answer is dropped.
//
// `api` and `store` are injected, so test/sync.test.js drives this with fakes. app.js only draws.

export const GIVE_UP_AFTER = 3; // failed sends Tandoor answered with an error (not offline) before dropping the ticks

/** The sync pill: {text, tone} with tone "ok" | "busy" | "off". */
/** `online`: the phone has a connection (navigator.onLine). Then an "offline" problem means home is
 *  out of reach, usually because Tailscale is off, and saying "Offline" would mislead. */
export function syncLabel({ problem, sending, waiting, left, fresh, online = true }) {
  if (sending) return { text: "Sending…", tone: "busy" };
  if (problem === "signin") return { text: "Sign in", tone: "off" };
  if (problem === "offline") {
    const what = online ? "Can't reach home" : "Offline";
    return { text: waiting ? `${what} · ${waiting} to send` : `${what} · saved list`, tone: "off" };
  }
  if (problem === "dropped") return { text: "Some ticks didn't save", tone: "off" };
  if (problem) return { text: waiting ? `Can't sync · ${waiting} to send` : "Can't reach Tandoor", tone: "off" };
  if (!fresh) return { text: "Saved list · checking…", tone: "busy" };
  if (waiting) return { text: `${waiting} to send`, tone: "busy" };
  return { text: `Synced · ${left} left`, tone: "ok" };
}

export class ShopSync {
  /**
   * @param api   {listEntries(), loadCatalog(), setChecked(ids, checked)}; errors carry kind "offline" | "signin" | "error"
   * @param store {load(), save(state) -> boolean}
   */
  constructor({ api, store, onChange = () => {} }) {
    this.api = api;
    this.store = store;
    this.onChange = onChange;
    this.entries = [];
    this.packages = {};
    this.catalog = { units: [], foods: [], categories: [] }; // for adding and changing items (foods.js, edit.js)
    this.pending = new Map(); // entry id -> {checked, ackSeq}: ackSeq is null until Tandoor accepts it
    this.seq = 0;             // counts refreshes and acks, to order them
    this.appliedSeq = 0;      // the start seq of the refresh whose answer is shown
    this.savedAt = null;      // when the list was last fetched
    this.fresh = false;       // fetched during this visit (not just the saved copy)
    this.problem = null;      // null | "offline" | "signin" | "error" | "dropped"
    this.errors = 0;          // consecutive error answers to sends
    this.sending = false;
    this.stored = true;       // false when the phone refused to save (ticks then don't survive a reload)
  }

  load() {
    const s = this.store.load();
    if (!s) return;
    this.entries = s.entries || [];
    this.packages = s.packages || {};
    this.catalog = s.catalog || this.catalog;
    this.savedAt = s.savedAt || null;
    // accepted ticks come back as accepted before any refresh (ackSeq 0), so the first refresh clears them
    this.pending = new Map((s.pending || []).map(([id, checked, acked]) => [id, { checked, ackSeq: acked ? 0 : null }]));
  }

  save() {
    this.stored = this.store.save({ entries: this.entries, packages: this.packages, catalog: this.catalog, savedAt: this.savedAt,
      pending: [...this.pending].map(([id, p]) => [id, p.checked, p.ackSeq !== null]) }) !== false;
  }

  /** The fetched list with unconfirmed ticks drawn over it. */
  view() {
    return this.entries.map(e => this.pending.has(e.id) ? { ...e, checked: this.pending.get(e.id).checked } : e);
  }

  /** Ids of ticks Tandoor hasn't accepted yet. */
  unsent() {
    return [...this.pending].filter(([, p]) => p.ackSeq === null).map(([id]) => id);
  }

  waiting() {
    return this.unsent().length;
  }

  /** Tick or untick these entries (one food's row) and send it. */
  set(ids, checked) {
    for (const id of ids) this.pending.set(id, { checked, ackSeq: null });
    if (this.problem === "dropped") this.problem = null;
    this.save();
    this.onChange();
    return this.flush();
  }

  /** Send unconfirmed ticks, grouped into one request per checked value; loops until none are left. */
  async flush() {
    if (this.sending) return;
    this.sending = true;
    this.onChange();
    try {
      for (;;) {
        const unsent = [...this.pending].filter(([, p]) => p.ackSeq === null);
        if (!unsent.length) break;
        const checked = unsent[0][1].checked;
        const ids = unsent.filter(([, p]) => p.checked === checked).map(([id]) => id);
        await this.api.setChecked(ids, checked);
        const ack = ++this.seq;
        for (const id of ids) {
          const p = this.pending.get(id);
          // a newer tick of the other value is still to send; leave it unsent
          if (p && p.ackSeq === null && p.checked === checked) p.ackSeq = ack;
        }
        this.problem = null;
        this.errors = 0;
        this.save();
      }
    } catch (e) {
      this.problem = e.kind || "error";
      if (this.problem === "error" && ++this.errors >= GIVE_UP_AFTER) {
        // Tandoor keeps refusing: stop drawing ticks it will never take, and say so
        for (const id of this.unsent()) this.pending.delete(id);
        this.problem = "dropped";
        this.errors = 0;
        this.save();
      }
    } finally {
      this.sending = false;
      this.onChange();
    }
  }

  /**
   * Fetch the list (and the catalog: package sizes, units, foods, aisles, when asked); keep the old
   * copy if that fails. The catalog failing doesn't cost the list. Returns whether the catalog was refreshed.
   */
  async refresh({ catalog = false } = {}) {
    const started = ++this.seq;
    const [list, cat] = await Promise.allSettled([this.api.listEntries(), catalog ? this.api.loadCatalog() : Promise.resolve(null)]);
    const gotCatalog = catalog && cat.status === "fulfilled";
    if (started < this.appliedSeq) return gotCatalog; // a newer refresh already answered
    if (gotCatalog) {
      const { packages, ...rest } = cat.value;
      this.packages = packages;
      this.catalog = rest;
    }
    if (list.status === "fulfilled") {
      this.appliedSeq = started;
      this.entries = list.value;
      this.savedAt = Date.now();
      this.fresh = true;
      const live = new Set(list.value.map(e => e.id));
      for (const [id, p] of this.pending) {
        // confirmed before this fetch started, so the fetch already shows it; or deleted elsewhere
        if (p.ackSeq !== null && (p.ackSeq < started || !live.has(id))) this.pending.delete(id);
      }
      if (this.problem !== "dropped" && (!this.waiting() || this.problem === "offline")) this.problem = null;
      this.save();
    } else {
      this.problem = list.reason?.kind || "error";
    }
    this.onChange();
    return gotCatalog;
  }
}
