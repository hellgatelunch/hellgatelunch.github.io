// Hellgate Lunch — Scriptable widget (small / 2x2)
// Shows the Hellgate Elementary K-8 lunch. Tap the widget for the full week.
// Each month it reads the new lunch menu straight from the school's website.

// November 2026, typed in. Later months come from the school's menu file.
const MENU = {
  // November 2026
  "2026-11-02": ["Sweet & Sour Chicken/Rice", "Green Beans", "Pears", "Fortune Cookie"],
  "2026-11-03": ["Beef Hot Dog", "Baked Beans", "Peaches"],
  "2026-11-04": ["Beef Burrito", "Carrots/Ranch", "Grapes"],
  "2026-11-05": ["Chicken Nuggets", "Broccoli/Ranch", "Orange Slices"],
  "2026-11-06": ["Sloppy Joe", "Seasoned Tots", "Apple Slices"],
  "2026-11-09": ["Orange Chicken/Rice", "Steamed Peas", "Mixed Fruit", "Fortune Cookie"],
  "2026-11-10": ["Cheeseburger", "Oven Fries", "Strawberries"],
  "2026-11-11": ["Chicken Strips", "Carrots/Ranch", "Grapes"],
  "2026-11-12": ["Corn Dog", "Celery/Ranch", "Peach Cup", "Hummus"],
  "2026-11-13": ["Beef Chili/Cheese", "Steamed Broccoli", "Pears", "Corn Chips"],
  "2026-11-16": ["Beef Meatball Sub/Cheese", "Broccoli/Ranch", "Mixed Fruit"],
  "2026-11-17": ["Biscuits & Sausage Gravy", "Tri Tater", "Peaches"],
  "2026-11-18": ["Beef Taco", "Black Beans", "Mandarin Oranges"],
  "2026-11-19": ["Chicken Noodle Soup", "Mixed Veggies", "Mixed Berry Cup", "Goldfish Crackers"],
  "2026-11-20": ["Turkey/Cheddar Wrap", "Carrots/Ranch", "Apple Slices", "Chips"],
  "2026-11-23": ["Grilled Cheese", "Tomato Soup", "Peaches", "Goldfish Crackers"],
  "2026-11-24": ["Chicken Strips", "Carrots/Ranch", "Mixed Fruit"],
  "2026-11-25": null,
  "2026-11-26": null,
  "2026-11-27": null,
  "2026-11-30": ["Beef Burrito", "Carrots/Ranch", "Pears"],
};

const PAGE_URL = "https://www.hellgate.k12.mt.us/departments/food-services/school-breakfast-lunch-program/k-8-food-menu";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
// Ask for PNG first: the school's file host turns its PDFs into a PNG when asked.
const ACCEPT = "image/png,image/jpeg;q=0.9,application/pdf;q=0.8,*/*;q=0.5";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const SWITCH_HOUR = 14; // after 2 PM, show the next school day
const CHECK_EVERY_MS = 6 * 3600 * 1000;

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const pad2 = n => String(n).padStart(2, "0");
const key = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthKey = (y, m) => `${y}-${pad2(m + 1)}`;
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ---------- saved files ----------
const fm = FileManager.local();
const DIR = fm.joinPath(fm.documentsDirectory(), "hellgate-lunch");
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
const STATE_PATH = fm.joinPath(DIR, "state.json");
const cellPath = k => fm.joinPath(DIR, k + ".png");
const hasCell = k => fm.fileExists(cellPath(k));

function blankState() {
  return { src: {}, file: {}, unreadable: {}, noLunch: {}, lastCheck: 0, waiting: null };
}
function loadState() {
  try { return Object.assign(blankState(), JSON.parse(fm.readString(STATE_PATH))); }
  catch (e) { return blankState(); }
}
function saveState(s) { fm.writeString(STATE_PATH, JSON.stringify(s)); }

// Keeps last month and later; older day pictures are deleted.
function pruneOld(state) {
  const cut = new Date(); cut.setDate(1); cut.setMonth(cut.getMonth() - 1);
  const min = key(cut);
  for (const f of fm.listContents(DIR)) {
    if (/^\d{4}-\d{2}-\d{2}\.png$/.test(f) && f < min) fm.remove(fm.joinPath(DIR, f));
  }
  for (const k of Object.keys(state.noLunch)) if (k < min) delete state.noLunch[k];
}

// ---------- which day to show ----------
function shortLabel(day, today) {
  const diff = Math.round((midnight(day) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${DOW[day.getDay()].slice(0, 3)}, ${MON[day.getMonth()]} ${day.getDate()}`;
}

// Today until 2 PM, then the next school day. Typed-in days first, otherwise the box
// from the school's menu. Skips days with no lunch; stops at the first weekday with no menu.
function pick(now, state) {
  const today = midnight(now);
  let day = new Date(today);
  if (now.getHours() >= SWITCH_HOUR) day = addDays(day, 1);
  for (let i = 0; i < 21; i++) {
    const k = key(day), dow = day.getDay();
    if (k in MENU) {
      if (MENU[k]) return { day, items: MENU[k], label: shortLabel(day, today) };
    } else if (dow !== 0 && dow !== 6 && !state.noLunch[k]) {
      if (!hasCell(k)) break;
      return { day, cell: k, label: shortLabel(day, today) };
    }
    day = addDays(day, 1);
  }
  return { day, label: "Lunch" };
}

// ---------- reading the school's page ----------
function decodeHtml(s) {
  return s.replace(/&amp;|&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\\\//g, "/");
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
function absolute(href, base) {
  href = decodeHtml(href).trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return "https:" + href;
  const origin = base.match(/^https?:\/\/[^/]+/)[0];
  if (href.startsWith("/")) return origin + href;
  return base.replace(/[^/]*$/, "") + href;
}
function attr(tag, name) {
  const m = tag.match(new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i"));
  return m ? decodeHtml(m[2] !== undefined ? m[2] : m[3]) : "";
}

// The school's file host (Finalsite) puts resize/convert steps in the path, e.g.
//   .../images/f_auto,q_auto,t_image_size_2/v1793201331/hellgatek12mtus/<id>/NovemberLUNCH2026docx.pdf
// Without them it serves the original file; with "f_auto,q_auto" (and Accept: image/png)
// it serves a full-size PNG of the first page.
const FS_FILE = /^(https?:\/\/resources\.finalsite\.net\/images\/)(?:[^/]*\/)*?(v\d+\/.+)$/i;
function original(url) { const m = url.match(FS_FILE); return m ? m[1] + m[2] : url; }
function rendition(url) { const m = url.match(FS_FILE); return m && /\.pdf$/i.test(m[2]) ? m[1] + "f_auto,q_auto/" + m[2] : null; }

function extractLinks(html, base) {
  const out = [], byUrl = {};
  const add = (text, href) => {
    const url = original(absolute(href, base));
    if (!/^https?:/i.test(url)) return;
    if (byUrl[url]) { if (text && !byUrl[url].text) byUrl[url].text = text; return; }
    byUrl[url] = { text, url, render: rendition(url) };
    out.push(byUrl[url]);
  };
  let m;
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = anchor.exec(html))) add(decodeHtml(m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()), m[1]);
  // Finalsite shows a PDF as an <img> with an empty src; its file URLs sit in data-image-sizes.
  const img = /<img\b[^>]*>/gi;
  while ((m = img.exec(html))) {
    const tag = m[0], text = (attr(tag, "alt") + " " + attr(tag, "data-resource-filename")).trim();
    const sizes = safeDecode(attr(tag, "data-image-sizes"));
    const urls = sizes.match(/https?:\/\/[^"\s]+/g) || [];
    const src = attr(tag, "src");
    if (src && !src.startsWith("data:")) urls.push(src);
    for (const u of urls) add(text, u);
  }
  const dataUrl = /data-[\w-]*(?:url|href|src)\s*=\s*["']([^"']+)["']/gi;
  while ((m = dataUrl.exec(html))) add("", m[1]);
  // Any other file address in the page. Lazy, so it never runs on into the next address.
  const bare = /https?:[^"'\s<>(){}]+?\.(?:pdf|png|jpe?g)(?![\w])(?:\?[^"'\s<>(){}]*)?/gi;
  while ((m = bare.exec(html))) add("", m[0]);
  return out;
}
// Link text plus the file name — not the whole address, whose random parts can look like dates.
function describe(l) {
  const file = safeDecode(l.url.split(/[?#]/)[0].split("/").pop() || "");
  return (l.text + " " + file).toLowerCase();
}
// A lunch menu names a month ("School Lunch Prices" is not a menu).
function isLunch(l) {
  const hay = describe(l);
  return hay.includes("lunch") && !hay.includes("breakfast") && monthOf(hay, new Date()) !== null;
}
function monthOf(hay, now) {
  let month = MON_LONG.findIndex(n => hay.includes(n.toLowerCase()));
  if (month < 0) {
    month = MON.findIndex(a => new RegExp("(^|[^a-z])" + a.toLowerCase() + "([^a-z]|lunch|20\\d\\d)").test(hay));
  }
  if (month < 0) return null;
  const ym = hay.match(/(?:^|\D)(20\d\d)(?!\d)/);
  let year;
  if (ym) year = parseInt(ym[1], 10);
  else {
    year = now.getFullYear();
    const diff = month - now.getMonth();
    if (diff < -6) year++; else if (diff > 6) year--;
  }
  return { year, month };
}

const LINKS_JS = `(function(){var out=[];
document.querySelectorAll('a[href]').forEach(function(a){out.push([(a.textContent||'').replace(/\\s+/g,' ').trim(),a.href]);});
document.querySelectorAll('img').forEach(function(i){var t=((i.alt||'')+' '+(i.getAttribute('data-resource-filename')||'')).trim();
if(i.currentSrc||i.src)out.push([t,i.currentSrc||i.src]);});
document.querySelectorAll('*').forEach(function(e){for(var i=0;i<e.attributes.length;i++){var n=e.attributes[i].name;
if(/^data-.*(url|href|src)$/.test(n))out.push(['',e.attributes[i].value]);}});
return JSON.stringify(out);})()`;

async function getLinks(allowWebView) {
  let html;
  try {
    const r = new Request(PAGE_URL);
    r.headers = { "User-Agent": UA };
    r.timeoutInterval = 15;
    html = await r.loadString();
  } catch (e) {
    return null; // offline or site down
  }
  let links = extractLinks(html, PAGE_URL);
  if (!links.some(isLunch) && allowWebView) {
    // The page may add its links with scripts; read it like a browser does.
    try {
      const wv = new WebView();
      await wv.loadURL(PAGE_URL);
      const pairs = JSON.parse(await wv.evaluateJavaScript(LINKS_JS));
      const seen = new Set(links.map(l => l.url));
      for (const p of pairs) {
        const url = original(absolute(p[1], PAGE_URL));
        if (!seen.has(url)) { seen.add(url); links.push({ text: p[0], url, render: rendition(url) }); }
      }
    } catch (e) {}
  }
  return links;
}

// Lunch menus for this month and next that we haven't processed yet.
function newMenus(links, state, now) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const wanted = [monthKey(now.getFullYear(), now.getMonth()), monthKey(next.getFullYear(), next.getMonth())];
  const out = [];
  for (const l of links) {
    if (!isLunch(l)) continue;
    const ym = monthOf(describe(l), now);
    if (!ym) continue;
    const mk = monthKey(ym.year, ym.month);
    if (!wanted.includes(mk) || state.src[mk] === l.url || out.some(o => o.mk === mk)) continue;
    if (Object.keys(MENU).some(k => k.startsWith(mk))) continue; // already typed in
    out.push({ url: l.url, render: l.render, year: ym.year, month: ym.month, mk });
  }
  return out;
}

// ---------- finding the calendar grid (runs inside a WebView canvas; tested off the phone) ----------
const CORE = String.raw`
function isColored(d, i) { if (d[i + 3] < 128) return false; return Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60; }
function isInk(d, i) { if (d[i + 3] < 128) return false; return 765 - (d[i] + d[i + 1] + d[i + 2]) > 60; }
function runGroups(run, min) {
  var out = [], start = -1;
  for (var i = 0; i <= run.length; i++) {
    var on = i < run.length && run[i] >= min;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (out.length && start - out[out.length - 1][1] <= 2) out[out.length - 1][1] = i - 1;
      else out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}
function gridFind(d, w, h) {
  var rowRun = new Array(h), rowInk = new Array(h), maxRow = 0, maxInk = 0;
  for (var y = 0; y < h; y++) {
    var best = 0, cur = 0, count = 0;
    for (var x = 0; x < w; x++) { var i4 = (y * w + x) * 4; cur = isInk(d, i4) ? cur + 1 : 0; if (isColored(d, i4)) count++; if (cur > best) best = cur; }
    rowRun[y] = best; rowInk[y] = count; if (best > maxRow) maxRow = best; if (count > maxInk) maxInk = count;
  }
  if (maxRow < w * 0.4) return null;
  // A mostly colored row (an orange header band with white day names) also counts as a line.
  for (var y3 = 0; y3 < h; y3++) if (rowInk[y3] >= maxRow * 0.5) rowRun[y3] = maxRow;
  var hg = runGroups(rowRun, maxRow * 0.6);
  var top = hg[0][0], bottom = hg[hg.length - 1][1];
  var colRun = new Array(w), maxCol = 0;
  for (var x2 = 0; x2 < w; x2++) {
    var b2 = 0, c2 = 0;
    for (var y2 = top; y2 <= bottom; y2++) { c2 = isInk(d, (y2 * w + x2) * 4) ? c2 + 1 : 0; if (c2 > b2) b2 = c2; }
    colRun[x2] = b2; if (b2 > maxCol) maxCol = b2;
  }
  if (maxCol < (bottom - top) * 0.5) return null;
  var vg = runGroups(colRun, maxCol * 0.6);
  if (vg.length < 2) return null;
  var xs = [];
  if (vg.length === 6) { for (var i = 0; i < 6; i++) xs.push(Math.floor((vg[i][0] + vg[i][1]) / 2)); }
  else { var l = vg[0][0], r = vg[vg.length - 1][1]; for (var j = 0; j < 6; j++) xs.push(l + Math.floor((r - l) * j / 5)); }
  var thin = Math.max(3, Math.floor(h / 100)), edges = [];
  hg.forEach(function (g) { if (g[1] - g[0] <= thin) edges.push(Math.floor((g[0] + g[1]) / 2)); else { edges.push(g[0]); edges.push(g[1]); } });
  var ys = [];
  edges.forEach(function (e) { if (!ys.length || e - ys[ys.length - 1] > thin) ys.push(e); });
  if (ys.length < 3) return null;
  return { w: w, h: h, xs: xs, ys: ys };
}
function weekRow(y, m, day) {
  var dow = new Date(y, m, day).getDay();
  if (dow === 0 || dow === 6) return -1;
  var off = (new Date(y, m, 1).getDay() + 6) % 7;
  var row = Math.floor((day - 1 + off) / 7);
  if (off >= 5) row--;
  return row;
}
function boxFor(g, y, m, day) {
  var row = weekRow(y, m, day);
  if (row < 0 || row >= g.ys.length - 2) return null;
  var col = (new Date(y, m, day).getDay() + 6) % 7;
  var inset = Math.max(2, Math.floor(g.w / 300));
  var x0 = g.xs[col] + inset, x1 = g.xs[col + 1] - inset, y0 = g.ys[row + 1] + inset, y1 = g.ys[row + 2] - inset;
  if (x1 - x0 < 10 || y1 - y0 < 10) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// Tight box around the writing in a day's box. The school puts the date number alone on
// the first line; the widget and week screen already show the date, so it is cut off.
// Returns null when nothing but the date is written (no lunch that day).
function trimBox(d, w, b) {
  var lines = [], cur = null, gap = Math.max(3, Math.floor(b.h / 50));
  for (var y = b.y; y < b.y + b.h; y++) {
    var lo = -1, hi = -1;
    for (var x = b.x; x < b.x + b.w; x++) {
      var i = (y * w + x) * 4;
      if (765 - (d[i] + d[i + 1] + d[i + 2]) > 90) { if (lo < 0) lo = x; hi = x; }
    }
    if (lo < 0) continue;
    if (cur && y - cur.y1 <= gap) { cur.y1 = y; if (lo < cur.x0) cur.x0 = lo; if (hi > cur.x1) cur.x1 = hi; }
    else { cur = { y0: y, y1: y, x0: lo, x1: hi }; lines.push(cur); }
  }
  if (lines.length && lines[0].x1 - lines[0].x0 < b.w * 0.12 && lines[0].y0 - b.y < b.h * 0.35) lines.shift();
  if (!lines.length) return null;
  var minX = 1e9, maxX = -1, minY = lines[0].y0, maxY = lines[lines.length - 1].y1;
  lines.forEach(function (l) { if (l.x0 < minX) minX = l.x0; if (l.x1 > maxX) maxX = l.x1; });
  var pad = Math.max(4, Math.floor(b.w / 40));
  var x0 = Math.max(b.x, minX - pad), y0 = Math.max(b.y, minY - pad);
  var x1 = Math.min(b.x + b.w, maxX + pad + 1), y1 = Math.min(b.y + b.h, maxY + pad + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
`;

const PROCESS_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
${CORE}
function loadPdfReader() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = '${PDFJS}';
    s.onload = res;
    s.onerror = function () { rej(new Error('PDF reader did not load')); };
    document.head.appendChild(s);
  });
}
async function processMenu(b64, kind, y, m, done) {
  try {
    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (kind === 'pdf') {
      await loadPdfReader();
      try {
        var blob = new Blob(['importScripts("${PDFJS_WORKER}")'], { type: 'application/javascript' });
        pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
      } catch (e) { pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_WORKER}'; }
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      var page = await pdf.getPage(1);
      var scale = 2000 / page.getViewport({ scale: 1 }).width;
      var vp = page.getViewport({ scale: scale });
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } else {
      var img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error('image did not load')); }; img.src = 'data:' + kind + ';base64,' + b64; });
      var w = img.naturalWidth, h = img.naturalHeight;
      if (w > 2600) { h = Math.round(h * 2600 / w); w = 2600; }
      canvas.width = w; canvas.height = h;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    }
    var W = canvas.width, H = canvas.height, data = ctx.getImageData(0, 0, W, H).data;
    var g = gridFind(data, W, H);
    if (!g) return done(JSON.stringify({ ok: false, error: 'no grid' }));
    var cells = {}, blank = [], last = new Date(y, m + 1, 0).getDate();
    for (var dd = 1; dd <= last; dd++) {
      var b = boxFor(g, y, m, dd);
      if (!b) continue;
      var k = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      var tb = trimBox(data, W, b);
      if (!tb) { blank.push(k); continue; }
      var s = Math.min(1, 900 / tb.w);
      var c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.round(tb.w * s)); c2.height = Math.max(1, Math.round(tb.h * s));
      var x2 = c2.getContext('2d');
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
      x2.drawImage(canvas, tb.x, tb.y, tb.w, tb.h, 0, 0, c2.width, c2.height);
      cells[k] = c2.toDataURL('image/png').split(',')[1];
    }
    done(JSON.stringify({ ok: true, cells: cells, blank: blank }));
  } catch (e) {
    done(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
  }
}
</script></body></html>`;

function kindOf(b64) {
  if (b64.startsWith("JVBER")) return "pdf";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("R0lG")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return null;
}

async function download(url) {
  const r = new Request(url);
  r.headers = { "User-Agent": UA, "Accept": ACCEPT };
  r.timeoutInterval = 30;
  return await r.load();
}

// The menu file as base64 plus its kind. Tries the ready-made PNG first, then the
// original file, then (for a page about the file) the first file that page links to.
async function fetchMenuFile(item) {
  for (const url of [item.render, item.url]) {
    if (!url) continue;
    try {
      const data = await download(url);
      const b64 = data.toBase64String(), kind = kindOf(b64);
      if (kind) return { b64, kind };
      const inner = extractLinks(data.toRawString() || "", url).find(l => /\.(pdf|png|jpe?g|gif|webp)([?#]|$)/i.test(l.url));
      if (inner) {
        const d2 = await download(inner.render || inner.url);
        const b2 = d2.toBase64String(), k2 = kindOf(b2);
        if (k2) return { b64: b2, kind: k2 };
      }
    } catch (e) {}
  }
  return null;
}

// Downloads one month's menu and saves a picture of each day's box. Returns true if it worked.
async function processMonth(item, state) {
  const file = await fetchMenuFile(item);
  if (!file) throw new Error("download failed");
  const wv = new WebView();
  await wv.loadHTML(PROCESS_PAGE, "https://www.hellgate.k12.mt.us/");
  const out = JSON.parse(await wv.evaluateJavaScript(
    `processMenu(${JSON.stringify(file.b64)}, ${JSON.stringify(file.kind)}, ${item.year}, ${item.month}, completion)`, true));
  if (!out.ok) return false;
  let saved = 0;
  for (const [k, cb64] of Object.entries(out.cells)) {
    fm.write(cellPath(k), Data.fromBase64String(cb64));
    delete state.noLunch[k];
    saved++;
  }
  for (const k of out.blank || []) {
    if (hasCell(k)) fm.remove(cellPath(k));
    state.noLunch[k] = true;
  }
  return saved > 0;
}

// Checks the school's page. In the widget it only looks; in the app it also loads new menus.
async function checkSchool(state, inApp) {
  const now = new Date();
  if (!inApp && Date.now() - state.lastCheck < CHECK_EVERY_MS) return "";
  state.lastCheck = Date.now();
  const links = await getLinks(inApp);
  if (links === null) { saveState(state); return "Couldn't reach the school's website. Showing the saved menu."; }
  const todo = newMenus(links, state, now);
  if (!inApp) {
    state.waiting = todo.length ? MON_LONG[todo[todo.length - 1].month] : null;
    saveState(state);
    return "";
  }
  let msg = links.some(isLunch) ? "Up to date with the school's website." : "No lunch menu found on the school's page yet.";
  for (const item of todo) {
    try {
      const ok = await processMonth(item, state);
      state.src[item.mk] = item.url;
      state.file[item.mk] = item.url;
      if (ok) { delete state.unreadable[item.mk]; msg = `Loaded the ${MON_LONG[item.month]} menu from the school's website.`; }
      else { state.unreadable[item.mk] = true; msg = `The ${MON_LONG[item.month]} menu is posted, but its layout couldn't be read.`; }
    } catch (e) {
      msg = "Couldn't download the new menu. It will try again next time.";
    }
  }
  state.waiting = null;
  pruneOld(state);
  saveState(state);
  return msg;
}

// ---------- home screen widget ----------
function buildWidget(p, state) {
  const bg = Color.dynamic(new Color("#FFFFFF"), new Color("#1D2521"));
  const ink = Color.dynamic(new Color("#1D2A24"), new Color("#E9EEE9"));
  const muted = Color.dynamic(new Color("#5D6B63"), new Color("#9EAAA3"));
  const accent = Color.dynamic(new Color("#C9541A"), new Color("#F08A4B"));

  const w = new ListWidget();
  w.backgroundColor = bg;
  w.setPadding(12, 12, 12, 12);

  const when = w.addText(p.label);
  when.font = Font.boldSystemFont(12);
  when.textColor = accent;
  when.lineLimit = 1;
  w.addSpacer(4);

  if (p.items) {
    const main = w.addText(p.items[0]);
    main.font = Font.boldSystemFont(19);
    main.textColor = ink;
    main.lineLimit = 3;
    main.minimumScaleFactor = 0.6;
    w.addSpacer();
    const sides = w.addText(p.items.slice(1).join(" · "));
    sides.font = Font.systemFont(12);
    sides.textColor = muted;
    sides.lineLimit = 3;
    sides.minimumScaleFactor = 0.8;
  } else if (p.cell) {
    // The day's box from the school's own menu.
    const holder = w.addStack();
    holder.backgroundColor = Color.white();
    holder.cornerRadius = 8;
    holder.setPadding(3, 3, 3, 3);
    holder.addSpacer();
    const img = holder.addImage(fm.readImage(cellPath(p.cell)));
    img.applyFittingContentMode();
    img.centerAlignImage();
    holder.addSpacer();
    w.addSpacer();
  } else {
    const main = w.addText(`${MON_LONG[p.day.getMonth()]} menu not posted yet`);
    main.font = Font.boldSystemFont(16);
    main.textColor = ink;
    main.lineLimit = 3;
    w.addSpacer();
  }

  if (state.waiting) {
    const tip = w.addText(`Tap to load the ${state.waiting} menu`);
    tip.font = Font.boldSystemFont(11);
    tip.textColor = accent;
    tip.lineLimit = 1;
    tip.minimumScaleFactor = 0.8;
  }

  // Redraw right after midnight and at 2 PM.
  const now = new Date();
  const next = new Date(now);
  if (now.getHours() < SWITCH_HOUR) next.setHours(SWITCH_HOUR, 0, 5, 0);
  else { next.setDate(next.getDate() + 1); next.setHours(0, 1, 0, 0); }
  w.refreshAfterDate = next;
  return w;
}

// ---------- full-week screen (opens when the widget is tapped) ----------
function weekHTML(p, status, state) {
  const cells = {};
  for (const f of fm.listContents(DIR)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.png$/);
    if (m) cells[m[1]] = fm.read(fm.joinPath(DIR, f)).toBase64String();
  }
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#EEF1EC;--card:#FFFFFF;--ink:#1D2A24;--muted:#5D6B63;--accent:#C9541A}
@media (prefers-color-scheme: dark){:root{--bg:#141A17;--card:#1D2521;--ink:#E9EEE9;--muted:#9EAAA3;--accent:#F08A4B}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px -apple-system,system-ui,sans-serif}
.wrap{padding:24px 18px 40px;max-width:520px;margin:0 auto}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--muted);margin:0}
h1{font-size:26px;margin:4px 0 6px}
.nav{display:flex;justify-content:space-between;margin-bottom:12px}
.nav button{background:none;border:0;color:var(--accent);font:600 16px -apple-system,system-ui;padding:6px 0}
.nav button:disabled{opacity:.35}
.card{background:var(--card);border-radius:16px;padding:12px 16px 14px;margin-bottom:10px;border:2px solid transparent}
.card.hl{border-color:var(--accent)}
.head{font-size:13px;font-weight:700;color:var(--muted)}
.hl .head{color:var(--accent)}
.main{font-size:20px;font-weight:700;margin-top:2px}
.off .main{color:var(--muted);font-size:18px}
.sides{font-size:15px;margin-top:2px}
.salad{font-size:12px;color:var(--muted);margin-top:4px}
.cell{display:block;max-width:100%;margin-top:6px;background:#fff;border-radius:10px;padding:6px;box-sizing:border-box}
.fine{font-size:13px;color:var(--muted);margin-top:12px}
a{color:var(--accent)}
</style></head><body><div class="wrap">
<p class="eyebrow">HELLGATE K-8 LUNCH</p>
<h1 id="title"></h1>
<div class="nav"><button id="prev">‹ Previous</button><button id="next">Next ›</button></div>
<div id="days"></div>
${status ? `<p class="fine">${esc(status)}</p>` : ""}
<p class="fine"><a href="${PAGE_URL}">Open the school's menu page</a></p>
<p class="fine">All meals include 1% chocolate or white milk.</p>
</div>
<script>
var MENU = ${JSON.stringify(MENU)};
var CELLS = ${JSON.stringify(cells)};
var NOLUNCH = ${JSON.stringify(state.noLunch || {})};
var FILES = ${JSON.stringify(state.file || {})};
var UNREADABLE = ${JSON.stringify(state.unreadable || {})};
var HL = "${key(p.day)}", TAG = "${p.items || p.cell ? p.label : ""}";
var DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var MONL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function p2(n){return (n<10?"0":"")+n}
function key(d){return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())}
function fromKey(k){var a=k.split("-");return new Date(+a[0],+a[1]-1,+a[2])}
function add(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){return add(d,-((d.getDay()+6)%7))}
function loaded(m){for(var i=0;i<5;i++){var k=key(add(m,i)); if((k in MENU)||CELLS[k]||NOLUNCH[k])return true}return false}
function salad(dow){var b3=dow==1||dow==5,b4=dow!=2;
  if(b3&&b4)return "Salad bar: Building 3 and Building 4"; if(b4)return "Salad bar: Building 4"; return "No salad bar on Tuesdays"}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}
// A one-line box (wide and short, like "NO SCHOOL") is a note, not a lunch. Size from the PNG header.
function oneLine(b64){var s=atob(b64.slice(0,32)),n=function(o){return ((s.charCodeAt(o)<<24)>>>0)+(s.charCodeAt(o+1)<<16)+(s.charCodeAt(o+2)<<8)+s.charCodeAt(o+3)};
  return n(20) < n(16)*0.3}
var week = monday(fromKey(HL));
function render(){
  var fri = add(week,4);
  document.getElementById("title").textContent = "Week of " + (week.getMonth()==fri.getMonth()
    ? MONL[week.getMonth()]+" "+week.getDate()+"–"+fri.getDate()
    : MON[week.getMonth()]+" "+week.getDate()+" – "+MON[fri.getMonth()]+" "+fri.getDate());
  var html = "";
  for (var i=0;i<5;i++){
    var d = add(week,i), k = key(d), hl = (k==HL), mk = k.slice(0,7);
    var head = DOW[d.getDay()]+", "+MON[d.getMonth()]+" "+d.getDate();
    if (hl && TAG) head = TAG+" · "+head;
    var body, off = false;
    if (k in MENU && MENU[k]===null) { body = '<div class="main">No school</div>'; off = true; }
    else if (k in MENU) body = '<div class="main">'+esc(MENU[k][0])+'</div>'
      + (MENU[k].length>1 ? '<div class="sides">'+esc(MENU[k].slice(1).join(" · "))+'</div>' : '')
      + '<div class="salad">'+salad(d.getDay())+'</div>';
    else if (CELLS[k]) body = '<img class="cell" alt="Lunch from the school menu" src="data:image/png;base64,'+CELLS[k]+'">'
      + (oneLine(CELLS[k]) ? '' : '<div class="salad">'+salad(d.getDay())+'</div>');
    else if (NOLUNCH[k]) { body = '<div class="main">No lunch listed</div>'; off = true; }
    else if (UNREADABLE[mk] && FILES[mk]) { body = '<div class="main">Posted, but the layout couldn\\'t be read</div><a href="'+FILES[mk]+'">Open '+MONL[d.getMonth()]+'\\'s menu</a>'; off = true; }
    else { body = '<div class="main">Menu not posted yet</div>'; off = true; }
    html += '<div class="card'+(hl?' hl':'')+(off?' off':'')+'"><div class="head">'+head+'</div>'+body+'</div>';
  }
  document.getElementById("days").innerHTML = html;
  document.getElementById("prev").disabled = !loaded(add(week,-7));
  document.getElementById("next").disabled = !loaded(add(week,7));
}
document.getElementById("prev").onclick = function(){ week = add(week,-7); render(); };
document.getElementById("next").onclick = function(){ week = add(week,7); render(); };
render();
</script></body></html>`;
}

// ---------- run ----------
const state = loadState();
if (config.runsInWidget) {
  try { await checkSchool(state, false); } catch (e) {}
  Script.setWidget(buildWidget(pick(new Date(), state), state));
} else {
  let status = "";
  try { status = await checkSchool(state, true); } catch (e) { status = "Couldn't check the school's website."; }
  const wv = new WebView();
  await wv.loadHTML(weekHTML(pick(new Date(), state), status, state));
  await wv.present(false);
}
Script.complete();
