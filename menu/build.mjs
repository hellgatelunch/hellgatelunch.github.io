// Builds the website's menu data (web/data/): reads the school's menu page, cuts each day's
// box out of the monthly lunch and breakfast menus with the same code the widget uses, adds
// the middle school Breakfast @ Break menu (menu/break.json), and writes menu.json.
//
//   node menu/build.mjs        live: fetch the school's page and files
//   offline, with saved copies:
//   node menu/build.mjs --page test/fixtures/k8-menu-page.html \
//     --lunch-file test/fixtures/november-2026.png --breakfast-file test/fixtures/november-2026-breakfast.png
//   --force           re-cut months that were already cut from the same file
//   --now 2026-11-25  pretend it's this date (which months are kept)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { loadCore, flatten } from "../lib/script-parts.mjs";
import { S, sortLinks } from "./sources.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "web", "data");
const MENU_JSON = path.join(DATA, "menu.json");
const BREAK_JSON = path.join(ROOT, "menu", "break.json");
const UA = "Mozilla/5.0 (compatible; hellgate-lunch-site/1.0)";

// Each monthly menu: where its day pictures go.
const MEALS = {
  lunch: { label: "Lunch", dir: "cells" },
  breakfast: { label: "Breakfast", dir: "cells-breakfast" },
};

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf("--" + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };

const core = loadCore();
const now = opt("now") ? new Date(opt("now") + "T12:00:00") : new Date();
const pad2 = n => String(n).padStart(2, "0");

async function get(url, accept) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": accept || "*/*" }, redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; }
}

// Cuts one month's menu picture into day pictures. Returns { days, noLunch } or null if no grid.
function cutMonth(png, year, month, dir) {
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
    fs.writeFileSync(path.join(DATA, dir, k + ".png"), PNG.sync.write(out, { colorType: 0 }));
    // A one-line box (like "NO SCHOOL") is a note, not a meal.
    days[k] = { img: `${dir}/${k}.png`, w: t.w, h: t.h, ...(t.h < t.w * 0.3 ? { note: true } : {}) };
  }
  return { days, noLunch };
}

// Cuts any new month of one meal's menu into data (= { months, days, noLunch }).
async function updateMeal(meal, links, data, wanted) {
  const { label, dir } = MEALS[meal];
  const cellsDir = path.join(DATA, dir);
  fs.mkdirSync(cellsDir, { recursive: true });
  const found = {};
  for (const l of links) if (wanted.includes(l.mk) && !found[l.mk]) found[l.mk] = l;
  console.log(`${label} menus on the school's page: ${Object.keys(found).join(", ") || "none"}`);

  for (const item of Object.values(found)) {
    const name = `${S.MON_LONG[item.month]} ${item.year}`;
    if (!opt("force") && data.months[item.mk] && data.months[item.mk].source === item.url) { console.log(`  ${name}: already cut`); continue; }
    let buf;
    try {
      buf = opt(meal + "-file") ? fs.readFileSync(opt(meal + "-file")) : await get(item.render || item.url, S.ACCEPT);
    } catch (e) { console.log(`  ${name}: download failed (${e.message}), will retry next run`); continue; }
    const entry = { name, source: item.url, cut: now.toISOString().slice(0, 10) };
    // Drop this month's old days, then cut the new ones.
    for (const k of Object.keys(data.days)) if (k.startsWith(item.mk)) delete data.days[k];
    data.noLunch = data.noLunch.filter(k => !k.startsWith(item.mk));
    for (const f of fs.readdirSync(cellsDir)) if (f.startsWith(item.mk)) fs.rmSync(path.join(cellsDir, f));
    let res = null;
    if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") res = cutMonth(PNG.sync.read(buf), item.year, item.month, dir);
    if (res && Object.keys(res.days).length) {
      Object.assign(data.days, res.days);
      data.noLunch.push(...res.noLunch);
      entry.ok = true;
      console.log(`  ${name}: cut ${Object.keys(res.days).length} days` + (res.noLunch.length ? `, ${res.noLunch.length} with nothing written` : ""));
    } else {
      entry.ok = false;
      console.log(`::warning::${label} ${name} is posted, but its layout couldn't be read.`);
    }
    data.months[item.mk] = entry;
  }

  // Forget months older than last month.
  for (const mk of Object.keys(data.months)) if (mk < wanted[0]) delete data.months[mk];
  for (const k of Object.keys(data.days)) if (k.slice(0, 7) < wanted[0]) delete data.days[k];
  data.noLunch = data.noLunch.filter(k => k.slice(0, 7) >= wanted[0]);
  for (const f of fs.readdirSync(cellsDir)) if (f.slice(0, 7) < wanted[0]) fs.rmSync(path.join(cellsDir, f));
}

const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const mealOut = d => ({ months: sorted(d.months), days: sorted(d.days), noLunch: [...new Set(d.noLunch)].sort() });

async function main() {
  const prev = readJson(MENU_JSON);
  const lunch = { months: prev.months || {}, days: prev.days || {}, noLunch: prev.noLunch || [] };
  const pb = prev.breakfast || {};
  const breakfast = { months: pb.months || {}, days: pb.days || {}, noLunch: pb.noLunch || [] };

  let html;
  try {
    html = opt("page") ? fs.readFileSync(opt("page"), "utf8") : (await get(S.PAGE_URL, "text/html")).toString("utf8");
  } catch (e) {
    // The school's site being down isn't our failure: keep the saved menu and try next run.
    console.log(`::warning::Couldn't reach the school's menu page (${e.message}). Keeping the saved menu.`);
    return;
  }
  const sortedLinks = sortLinks(S.extractLinks(html, S.PAGE_URL), now);

  // Last month, this month, next month.
  const wanted = [-1, 0, 1].map(o => { const d = new Date(now.getFullYear(), now.getMonth() + o, 1); return S.monthKey(d.getFullYear(), d.getMonth()); });
  await updateMeal("lunch", sortedLinks.lunch, lunch, wanted);
  await updateMeal("breakfast", sortedLinks.breakfast, breakfast, wanted);

  // Lunch days typed into the widget script are shown as text.
  const typed = {};
  for (const [k, v] of Object.entries(S.MENU)) if (k.slice(0, 7) >= wanted[0]) typed[k] = v;

  // Breakfast @ Break is typed in (menu/break.json). Warn if the school posts a different sheet.
  const br = readJson(BREAK_JSON);
  const posted = sortedLinks.breakSheet ? sortedLinks.breakSheet.url : null;
  const changed = !!posted && posted !== br.source;
  if (changed) console.log(`::warning::The school posted a new Breakfast @ Break sheet: ${posted}. Update menu/break.json from it.`);
  console.log(`Breakfast @ Break: ${posted ? (changed ? "school posted a NEW sheet" : "matches the typed-in sheet") : "sheet not on the page"}`);

  const out = {
    page: S.PAGE_URL,
    // Lunch stays at the top level so older cached copies of the app keep working.
    ...mealOut(lunch),
    typed: sorted(typed),
    breakfast: mealOut(breakfast),
    break: { note: br.note, always: br.always, menus: br.menus, source: br.source, ...(changed ? { newSheet: posted } : {}) },
  };
  fs.writeFileSync(MENU_JSON, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${path.relative(ROOT, MENU_JSON)}: ${Object.keys(out.days).length} lunch and ${Object.keys(out.breakfast.days).length} breakfast pictures, ${Object.keys(out.typed).length} typed-in lunch days`);
}

main().catch(e => { console.error(e); process.exit(1); });
