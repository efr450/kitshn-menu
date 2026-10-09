// Menu fork: the recipe inbox's rules for the Add recipe page (add/add.js draws them). The inbox
// server lives in the Menu repo (importer/menu_import/inbox.py); nginx passes /shop/api/inbox/ to it.
// It signs in with the browser's Tandoor session, like api.js; no token is stored.

export const BASE = "/shop/api/inbox";
export const MODES = { now: "Add now", look: "Show me the preview first" };
export const STAGES = { reading: "Reading the page", writing: "Writing the recipe", checking: "Checking it",
  adding: "Adding to Menu", auditing: "Double-checking" };

const failure = (kind, message) => Object.assign(new Error(message), { kind });

/** The link in what Android or the iPhone Shortcut shared: `url`, else the first link in `text`. */
export function sharedLink(params) {
  for (const v of [params.get("url"), params.get("text"), params.get("title")]) {
    const m = /https?:\/\/[^\s<>"']+/.exec(v || "");
    if (m) return m[0].replace(/[).,;!?]+$/, "");
  }
  return null;
}

/** The pill on a job's row. */
export function pill(job) {
  if (job.state === "queued") return { text: "Waiting its turn", kind: "" };
  if (job.state === "running") return { text: `${STAGES[job.stage] || "Starting"}…`, kind: "" };
  if (job.state === "ask") return job.preview_ready ? { text: "Preview ready · tap", kind: "ask" }
    : { text: job.questions === 1 ? "1 quick question" : `${job.questions} quick questions`, kind: "ask" };
  if (job.state === "done") return { text: "✓ Added", kind: "ok" };
  return { text: "Couldn't add it", kind: "bad" };
}

/** How far along a running job is, 0-1, for its bar. */
export function progress(job) {
  const order = Object.keys(STAGES);
  const i = order.indexOf(job.stage);
  return job.state === "queued" ? 0.04 : (Math.max(i, 0) + 0.5) / order.length;
}

export const active = job => job.state === "queued" || job.state === "running";

/**
 * A draft reply to one job: answers by question id, comments by part. Parts are "photo",
 * "description", "ingredients" and "step N".
 */
export class Draft {
  constructor() { this.answers = {}; this.comments = {}; }
  answer(id, value) { this.answers[id] = value; }
  comment(part, text) { if (text.trim()) this.comments[part] = text.trim(); else delete this.comments[part]; }
  /** The first question still unanswered, or null. */
  next(questions) { return questions.find(q => this.answers[q.id] == null) || null; }
  answered(questions) { return questions.filter(q => this.answers[q.id] != null).length; }
  hasComments() { return Object.keys(this.comments).length > 0; }
  /** The body the server's reply endpoint takes. */
  body(action, mode) {
    return { action, ...(mode ? { mode } : {}), answers: { ...this.answers },
      comments: Object.entries(this.comments).map(([part, text]) => ({ part, text })) };
  }
}

/** What the dock offers once every question is answered. */
export function nextActions(job, draft) {
  if (job.state === "done") return draft.hasComments() ? [{ action: "change", label: "Send changes" }] : [];
  if (job.state !== "ask") return [];
  if (!job.preview) return [{ action: "add", label: "Add to Menu" }];
  return draft.hasComments()
    ? [{ action: "revise", label: "Send changes" }, { action: "add", label: "Add with my changes", quiet: true }]
    : [{ action: "add", label: "Looks good · Add to Menu" }];
}

/** The inbox server's API. @param fetchFn fetch, injectable for tests */
export function inboxApi({ fetchFn = (...a) => fetch(...a) } = {}) {
  async function call(path, init = {}) {
    let r;
    try {
      r = await fetchFn(BASE + path, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...init.headers } });
    } catch (e) {
      throw failure("offline", e.message);
    }
    if (r.status === 401) throw failure("signin", "sign in");
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw failure("error", data.error || `HTTP ${r.status}`);
    return data;
  }
  const post = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    jobs: () => call("/jobs"),
    job: id => call(`/jobs/${encodeURIComponent(id)}`),
    add: (url, mode) => post("/jobs", { url, mode }),
    reply: (id, body) => post(`/jobs/${encodeURIComponent(id)}/reply`, body),
    retry: id => post(`/jobs/${encodeURIComponent(id)}/retry`, {}),
    pushKey: () => call("/push").then(d => d.key),
    subscribe: subscription => post("/push", { subscription }),
  };
}

/** The VAPID key, as pushManager.subscribe wants it. */
export function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
