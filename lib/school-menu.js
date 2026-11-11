// Hellgate menus: reading the school's website. Shared code for the website build
// (menu/build.mjs) and the tests, loaded section by section by lib/script-parts.mjs.
// It started as the original iPhone widget; the widget now reads the website's menu instead.
// Sections are marked with "// ---------- <name>" lines; keep the markers when editing.


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

// ---------- end ----------
