// Builds the website's menu data (web/data/ and web/calendar.ics) from the school's menus, as
// files. The reading itself is menu/pipeline.mjs (shared with the Netlify function).
//
//   node menu/build.mjs        live: fetch the school's page and files
//   offline, with saved copies:
//   node menu/build.mjs --page test/fixtures/k8-menu-page.html \
//     --lunch-file test/fixtures/november-2026.png --breakfast-file test/fixtures/november-2026-breakfast.png
//   --force           re-cut months that were already cut from the same file
//   --now 2026-11-25  pretend it's this date (which months are kept)
//   --site URL        the website's address, for the calendar's links (default: GitHub Pages)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refresh, schoolHost } from "./pipeline.mjs";
import { safeParse } from "./schema.mjs";

export { schoolHost };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "web", "data");
const MENU_JSON = path.join(DATA, "menu.json");
const CALENDAR = path.join(ROOT, "web", "calendar.ics");
const BREAK_JSON = path.join(ROOT, "menu", "break.json");
const CELL_DIRS = ["cells", "cells-breakfast"];

function readJson(file) {
  try { return safeParse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; }
}

// The day pictures saved in web/data, as the pipeline's Map.
function readCells() {
  const cells = new Map();
  for (const dir of CELL_DIRS) {
    const full = path.join(DATA, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (/^\d{4}-\d\d-\d\d\.png$/.test(f)) cells.set(`${dir}/${f}`, fs.readFileSync(path.join(full, f)));
  }
  return cells;
}

// Makes web/data's pictures match the Map: writes new or changed ones, removes dropped ones.
function writeCells(cells) {
  for (const dir of CELL_DIRS) {
    const full = path.join(DATA, dir);
    fs.mkdirSync(full, { recursive: true });
    for (const f of fs.readdirSync(full)) if (/^\d{4}-\d\d-\d\d\.png$/.test(f) && !cells.has(`${dir}/${f}`)) fs.rmSync(path.join(full, f));
  }
  for (const [k, buf] of cells) {
    const p = path.join(DATA, k);
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(buf)) fs.writeFileSync(p, buf);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf("--" + n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };
  const res = await refresh({
    prev: readJson(MENU_JSON),
    cells: readCells(),
    breakJson: readJson(BREAK_JSON),
    now: opt("now") ? new Date(opt("now") + "T12:00:00") : new Date(),
    site: typeof opt("site") === "string" ? opt("site") : "https://hellgatelunch.github.io/",
    force: !!opt("force"),
    page: opt("page") ? async () => fs.readFileSync(opt("page"), "utf8") : null,
    file: async (meal, kind) => {
      const f = opt(`${meal}-${kind === "render" ? "file" : "pdf"}`);
      return typeof f === "string" ? fs.readFileSync(f) : null;
    },
  });
  if (!res.ok) { console.log(`::warning::${res.reason}`); return; }
  writeCells(res.cells);
  fs.writeFileSync(MENU_JSON, JSON.stringify(res.menu, null, 1) + "\n");
  console.log(`Wrote ${path.relative(ROOT, MENU_JSON)}: ${Object.keys(res.menu.days).length} lunch days, ${Object.keys(res.menu.breakfast.days).length} breakfast days`);
  fs.writeFileSync(CALENDAR, res.ics);
  console.log(`Wrote ${path.relative(ROOT, CALENDAR)}: ${(res.ics.match(/BEGIN:VEVENT/g) || []).length} school days`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
