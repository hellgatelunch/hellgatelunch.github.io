// Builds the website's menu data (web/data/): reads the school's menu page, cuts each day's
// box out of the lunch menu with the same code the widget uses, and writes menu.json.
//
//   node menu/build.mjs                      live: fetch the school's page and files
//   node menu/build.mjs --page test/fixtures/k8-menu-page.html --file test/fixtures/november-2026.png
//                                            offline: use saved copies
//   --force    re-cut months that were already cut from the same file
//   --now 2026-11-25    pretend it's this date (which months are kept)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { loadCore, loadSection, flatten } from "../lib/script-parts.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "web", "data");
const CELLS = path.join(DATA, "cells");
const MENU_JSON = path.join(DATA, "menu.json");
const UA = "Mozilla/5.0 (compatible; hellgate-lunch-site/1.0)";

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf("--" + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };

const S = loadSection("// ---------- reading the school's page", "// ---------- finding the calendar grid",
  ["extractLinks", "isLunch", "monthOf", "describe", "PAGE_URL", "MENU", "ACCEPT", "monthKey", "MON_LONG"]);
const core = loadCore();

const now = opt("now") ? new Date(opt("now") + "T12:00:00") : new Date();
const pad2 = n => String(n).padStart(2, "0");

async function get(url, accept) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": accept || "*/*" }, redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

function loadJson() {
  try { return JSON.parse(fs.readFileSync(MENU_JSON, "utf8")); } catch (e) { return {}; }
}

// Cuts one month's menu picture into day pictures. Returns { days, noLunch } or null if no grid.
function cutMonth(png, year, month) {
  const img = flatten({ data: png.data, w: png.width, h: png.height });
  const g = core.gridFind(img.data, img.w, img.h);
  if (!g) return null;
  const days = {}, noLunch = [];
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const b = core.boxFor(g, year, month, d);
    if (!b) continue;
    const k = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const t = core.trimBox(img.data, img.w, b);
    if (!t) { noLunch.push(k); continue; }
    const out = new PNG({ width: t.w, height: t.h });
    for (let y = 0; y < t.h; y++) {
      const s = ((t.y + y) * img.w + t.x) * 4;
      img.data.copy(out.data, y * t.w * 4, s, s + t.w * 4);
    }
    fs.writeFileSync(path.join(CELLS, k + ".png"), PNG.sync.write(out, { colorType: 0 }));
    // A one-line box (like "NO SCHOOL") is a note, not a lunch.
    days[k] = { img: `cells/${k}.png`, w: t.w, h: t.h, ...(t.h < t.w * 0.3 ? { note: true } : {}) };
  }
  return { days, noLunch };
}

async function main() {
  fs.mkdirSync(CELLS, { recursive: true });
  const prev = loadJson();
  const data = { months: prev.months || {}, days: prev.days || {}, noLunch: prev.noLunch || [] };

  let html;
  try {
    html = opt("page") ? fs.readFileSync(opt("page"), "utf8") : (await get(S.PAGE_URL, "text/html")).toString("utf8");
  } catch (e) {
    // The school's site being down isn't our failure: keep the saved menu and try next run.
    console.log(`::warning::Couldn't reach the school's menu page (${e.message}). Keeping the saved menu.`);
    return;
  }
  const links = S.extractLinks(html, S.PAGE_URL).filter(S.isLunch);

  // Last month, this month, next month.
  const wanted = [-1, 0, 1].map(o => { const d = new Date(now.getFullYear(), now.getMonth() + o, 1); return S.monthKey(d.getFullYear(), d.getMonth()); });
  const found = {};
  for (const l of links) {
    const ym = S.monthOf(S.describe(l), now);
    if (!ym) continue;
    const mk = S.monthKey(ym.year, ym.month);
    if (wanted.includes(mk) && !found[mk]) found[mk] = { ...l, ...ym, mk };
  }
  console.log(`Lunch menus on the school's page: ${Object.keys(found).join(", ") || "none"}`);

  for (const item of Object.values(found)) {
    const name = `${S.MON_LONG[item.month]} ${item.year}`;
    if (!opt("force") && data.months[item.mk] && data.months[item.mk].source === item.url) { console.log(`  ${name}: already cut`); continue; }
    let buf;
    try {
      buf = opt("file") ? fs.readFileSync(opt("file")) : await get(item.render || item.url, S.ACCEPT);
    } catch (e) { console.log(`  ${name}: download failed (${e.message}), will retry next run`); continue; }
    const entry = { name, source: item.url, cut: now.toISOString().slice(0, 10) };
    // Drop this month's old days, then cut the new ones.
    for (const k of Object.keys(data.days)) if (k.startsWith(item.mk)) { delete data.days[k]; }
    data.noLunch = data.noLunch.filter(k => !k.startsWith(item.mk));
    for (const f of fs.readdirSync(CELLS)) if (f.startsWith(item.mk)) fs.rmSync(path.join(CELLS, f));
    let res = null;
    if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") res = cutMonth(PNG.sync.read(buf), item.year, item.month);
    if (res && Object.keys(res.days).length) {
      Object.assign(data.days, res.days);
      data.noLunch.push(...res.noLunch);
      entry.ok = true;
      console.log(`  ${name}: cut ${Object.keys(res.days).length} days` + (res.noLunch.length ? `, ${res.noLunch.length} with nothing written` : ""));
    } else {
      entry.ok = false;
      console.log(`  ${name}: posted, but its layout couldn't be read`);
    }
    data.months[item.mk] = entry;
  }

  // Forget months older than last month.
  for (const mk of Object.keys(data.months)) if (mk < wanted[0]) delete data.months[mk];
  for (const k of Object.keys(data.days)) if (k.slice(0, 7) < wanted[0]) delete data.days[k];
  data.noLunch = data.noLunch.filter(k => k.slice(0, 7) >= wanted[0]);
  for (const f of fs.readdirSync(CELLS)) if (f.slice(0, 7) < wanted[0]) fs.rmSync(path.join(CELLS, f));

  // Days typed into the widget script are shown as text.
  const typed = {};
  for (const [k, v] of Object.entries(S.MENU)) if (k.slice(0, 7) >= wanted[0]) typed[k] = v;

  const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    page: S.PAGE_URL,
    months: sorted(data.months),
    typed: sorted(typed),
    days: sorted(data.days),
    noLunch: [...new Set(data.noLunch)].sort(),
  };
  fs.writeFileSync(MENU_JSON, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${path.relative(ROOT, MENU_JSON)}: ${Object.keys(out.days).length} day pictures, ${Object.keys(out.typed).length} typed-in days`);
}

main().catch(e => { console.error(e); process.exit(1); });
