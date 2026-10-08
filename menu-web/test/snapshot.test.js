import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotFileName, snapshotHtml } from "../public/snapshot.js";

const aisles = [{ name: "Dairy & <Eggs>", left: 1, rows: [
  { key: 54, name: "Milk, whole", ids: [1], done: false, buy: "1 half-gallon", amounts: "900 g" },
  { key: 9, name: "Butter", ids: [2], done: true, buy: null, amounts: "43 g" },
] }];
const at = Date.UTC(2026, 9, 8, 18, 30);

test("the saved copy carries every row, its buy amount and its state", () => {
  const html = snapshotHtml(aisles, at);
  assert.match(html, /Milk, whole<small>900 g in recipes<\/small><\/span><b>1 half-gallon<\/b>/);
  assert.match(html, /data-k="9" checked/);
  assert.match(html, /<b>43 g<\/b>/);
});

test("names are escaped", () => {
  assert.match(snapshotHtml(aisles, at), /<h2>Dairy &amp; &lt;Eggs&gt;<\/h2>/);
});

test("it needs nothing from the network", () => {
  assert.doesNotMatch(snapshotHtml(aisles, at), /\b(src|href)=/);
});

test("file name says the day", () => assert.match(snapshotFileName(at), /^Shopping Oct \d+\.html$/));
