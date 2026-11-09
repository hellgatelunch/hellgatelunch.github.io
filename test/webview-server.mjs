// Serves the phone's menu-processing page (PROCESS_PAGE from hellgate-lunch.js) in a desktop
// browser, so the canvas / PDF.js part can be checked off the phone. Open http://localhost:8787/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadSection, FIXTURES } from "../lib/script-parts.mjs";

const PORT = Number(process.env.PORT || 8787);

function harness() {
  const { PROCESS_PAGE } = loadSection("// ---------- finding the calendar grid", "function kindOf", ["PROCESS_PAGE"]);
  const runner = `
<style>body{font:14px system-ui;margin:16px} .grid{display:flex;flex-wrap:wrap;gap:8px} figure{margin:0;border:1px solid #ccc;padding:4px}
figcaption{font-size:11px;color:#666} figure img{display:block;max-width:220px}</style>
<h2>PROCESS_PAGE check</h2><div id="log"></div><div id="cells" class="grid"></div>
<script>
async function b64of(url){const b=new Uint8Array(await (await fetch(url)).arrayBuffer());let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return btoa(s);}
async function run(file, kind){
  const t0 = performance.now();
  const out = JSON.parse(await new Promise(async r => processMenu(await b64of('/fixtures/'+file), kind, 2026, 10, r)));
  out.ms = Math.round(performance.now() - t0); out.file = file;
  out.count = out.cells ? Object.keys(out.cells).length : 0;
  return out;
}
window.results = (async () => {
  const res = [];
  for (const [f, k] of [["november-2026.png","image/png"],["november-2026-2200.jpg","image/jpeg"],["november-2026.pdf","pdf"]]) {
    const r = await run(f, k); res.push(r);
    document.getElementById('log').insertAdjacentHTML('beforeend', '<p><b>'+f+'</b>: ok='+r.ok+' cells='+r.count+' blank='+JSON.stringify(r.blank||[])+' '+(r.error||'')+' ('+r.ms+' ms)</p>');
    if (r.cells) for (const [d, b] of Object.entries(r.cells)) document.getElementById('cells').insertAdjacentHTML('beforeend',
      '<figure><img src="data:image/png;base64,'+b+'"><figcaption>'+f.split('.').pop()+' '+d+'</figcaption></figure>');
  }
  return res.map(r => ({ file: r.file, ok: r.ok, count: r.count, blank: r.blank, error: r.error, ms: r.ms,
    sizes: r.cells ? Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, v.length])) : null }));
})();
</script>`;
  return PROCESS_PAGE.replace("</body>", runner + "</body>");
}

// The tap-to-open week screen, with the typed-in menu emptied so every day comes from the
// day pictures in test/out (run npm test first). /week?now=2026-11-09T15:00&status=...
function week(query) {
  const src = fs.readFileSync(new URL("../hellgate-lunch.js", import.meta.url), "utf8");
  const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const OUTDIR = new URL("./out/", import.meta.url);
  const files = fs.existsSync(OUTDIR) ? fs.readdirSync(OUTDIR).filter(f => /^\d{4}-\d{2}-\d{2}\.png$/.test(f)) : [];
  const fm = {
    listContents: () => files,
    joinPath: (a, b) => b,
    read: f => ({ toBase64String: () => fs.readFileSync(new URL(f, OUTDIR)).toString("base64") }),
  };
  const head = src.slice(0, src.indexOf("// ---------- saved files")).replace(/const MENU = \{[\s\S]*?\n\};/, "const MENU = {};");
  const code = head + `const DIR = "", hasCell = k => fm.listContents().includes(k + ".png");\n`
    + cut("// ---------- which day to show", "// ---------- reading the school's page")
    + cut("// ---------- full-week screen", "// ---------- run")
    + `\nreturn weekHTML(pick(NOW, STATE), STATUS, STATE);`;
  const now = query.get("now") ? new Date(query.get("now")) : new Date(2026, 10, 9, 10);
  const state = { src: {}, file: {}, unreadable: {}, noLunch: { "2026-11-25": true }, lastCheck: 0, waiting: null };
  return new Function("fm", "NOW", "STATE", "STATUS", code)(fm, now, state, query.get("status") || "");
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/week") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(week(new URL(req.url, "http://x").searchParams));
  }
  if (url === "/" || url === "/harness.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(harness());
  }
  if (url.startsWith("/fixtures/")) {
    const f = path.join(FIXTURES, path.basename(url));
    if (fs.existsSync(f)) { res.writeHead(200); return res.end(fs.readFileSync(f)); }
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => console.log(`PROCESS_PAGE harness on http://localhost:${PORT}/`));
