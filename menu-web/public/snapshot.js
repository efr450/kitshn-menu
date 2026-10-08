// "Save copy": the list as one self-contained HTML file that opens with no app and no signal.
// Its ticks are its own (kept in that file's browser storage) and never sync. Pure: test/snapshot.test.js.

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function snapshotFileName(savedAt) {
  const d = new Date(savedAt);
  return `Shopping ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.html`;
}

/** @param aisles from shoppingAisles; @param savedAt ms when the list was fetched */
export function snapshotHtml(aisles, savedAt) {
  const when = new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const rows = aisles.map(a => `<h2>${esc(a.name)}</h2>` + a.rows.map(r =>
    `<label class="row"><input type="checkbox" data-k="${esc(r.key)}"${r.done ? " checked" : ""}>` +
    `<span class="food">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>` +
    `<b>${esc(r.buy || r.amounts)}</b></label>`).join("")).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shopping (saved ${esc(when)})</title>
<style>
body{margin:0;padding:12px;background:#17140c;color:#ece2cc;font:15px system-ui,sans-serif}
h1{font:400 1.3rem Georgia,serif;margin:4px 0}p{color:#c9bea6;font-size:12px;margin:0 0 8px}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#e6c66a;margin:14px 4px 4px}
.row{display:grid;grid-template-columns:26px 1fr auto;gap:10px;align-items:center;background:#221e14;border-radius:10px;padding:12px;margin:5px 0}
.row input{width:20px;height:20px;accent-color:#e6c66a}.food small{display:block;color:#c9bea6;font-size:12px}
b{color:#e6c66a;font-weight:500;white-space:nowrap}.row:has(input:checked){opacity:.45;text-decoration:line-through}
</style></head><body><h1>Shopping</h1><p>Saved copy from ${esc(when)}. Ticks here stay in this file and don't sync.</p>
${rows}
<script>
var K="menu-shop-copy-${Number(savedAt)}",s={};try{s=JSON.parse(localStorage.getItem(K))||{}}catch(e){}
document.querySelectorAll("input[data-k]").forEach(function(i){var k=i.dataset.k;if(k in s)i.checked=s[k];
i.addEventListener("change",function(){s[k]=i.checked;try{localStorage.setItem(K,JSON.stringify(s))}catch(e){}})});
</script></body></html>`;
}
