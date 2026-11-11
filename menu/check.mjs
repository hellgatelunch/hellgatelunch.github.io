// Checks menu data (menu.json, the day pictures and calendar.ics) before it's saved and
// published. The build reads the school's files, which we don't control, so publishing trusts
// nothing it made: every field must have the expected shape, text must be plain and short,
// links must point at the school, pictures must be plain PNGs, and the calendar must be exactly
// what menu.json says. The rules themselves live in menu/schema.mjs. Node built-ins only.
//
//   node menu/check.mjs            checks web/ in this repository; exits 1 and lists problems
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeIcs } from "./calendar.mjs";
import { schoolUrl, plainText, isDate, isMonth, safeParse, pngProblem, PICTURE } from "./schema.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = "https://hellgatelunch.github.io/";
const PAGE_URL = "https://www.hellgate.k12.mt.us/departments/food-services/school-breakfast-lunch-program/k-8-food-menu";

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const keysIn = (o, allowed) => Object.keys(o).every(k => allowed.includes(k));
const size = n => Number.isSafeInteger(n) && n > 0 && n < 5000;

export { schoolUrl, plainText };

// Returns a list of problems with a menu.json object (empty when it's fine).
export function checkMenu(m) {
  const bad = [];
  const need = (ok, what) => { if (!ok) bad.push(what); };
  need(isObj(m), "menu.json is not an object");
  if (!isObj(m)) return bad;
  need(keysIn(m, ["page", "months", "days", "noLunch", "typed", "breakfast", "break"]), "unexpected top-level field");
  need(m.page === PAGE_URL, "page is not the school's menu page");

  const meal = (d, name) => {
    need(isObj(d) && keysIn(d, ["months", "days", "noLunch"]), `${name}: unexpected fields`);
    if (!isObj(d)) return;
    need(isObj(d.months) && Object.keys(d.months).length <= 6, `${name}.months`);
    for (const [mk, e] of Object.entries(isObj(d.months) ? d.months : {})) {
      need(isMonth(mk), `${name}.months key ${mk}`);
      need(isObj(e) && keysIn(e, ["name", "source", "cut", "ok"]), `${name}.months.${mk} fields`);
      if (!isObj(e)) continue;
      need(plainText(e.name, 40), `${name}.months.${mk}.name`);
      need(schoolUrl(e.source), `${name}.months.${mk}.source is not a school address`);
      need(isDate(e.cut), `${name}.months.${mk}.cut`);
      need(typeof e.ok === "boolean", `${name}.months.${mk}.ok`);
    }
    need(isObj(d.days) && Object.keys(d.days).length <= 100, `${name}.days`);
    const dir = name === "lunch" ? "cells" : "cells-breakfast";
    for (const [k, v] of Object.entries(isObj(d.days) ? d.days : {})) {
      need(isDate(k), `${name}.days key ${k}`);
      if (!isObj(v)) { bad.push(`${name}.days.${k} is not an object`); continue; }
      if ("items" in v) {
        need(keysIn(v, ["items"]) && Array.isArray(v.items) && v.items.length >= 1 && v.items.length <= 12
          && v.items.every(s => plainText(s)), `${name}.days.${k}.items`);
      } else if ("off" in v) {
        need(keysIn(v, ["off"]) && plainText(v.off, 80), `${name}.days.${k}.off`);
      } else {
        need(keysIn(v, ["img", "w", "h", "mask", "note"]) && PICTURE.test(v.img) && v.img === `${dir}/${k}.png`
          && size(v.w) && size(v.h) && v.mask === true && (v.note === undefined || v.note === true), `${name}.days.${k} picture`);
      }
    }
    need(Array.isArray(d.noLunch) && d.noLunch.length <= 100 && d.noLunch.every(isDate), `${name}.noLunch`);
  };
  meal({ months: m.months, days: m.days, noLunch: m.noLunch }, "lunch");
  meal(m.breakfast, "breakfast");

  need(isObj(m.typed) && Object.entries(m.typed).every(([k, v]) => isDate(k)
    && (v === null || (Array.isArray(v) && v.length <= 12 && v.every(s => plainText(s))))), "typed");

  const b = m.break;
  need(isObj(b) && keysIn(b, ["note", "always", "menus", "source", "newSheet"]), "break fields");
  if (isObj(b)) {
    need(b.note === undefined || plainText(b.note, 300), "break.note");
    need(Array.isArray(b.always) && b.always.every(s => plainText(s)), "break.always");
    need(b.source === undefined || schoolUrl(b.source), "break.source");
    need(b.newSheet === undefined || schoolUrl(b.newSheet), "break.newSheet");
    need(Array.isArray(b.menus) && b.menus.every(x => isObj(x) && keysIn(x, ["months", "days"])
      && Array.isArray(x.months) && x.months.every(n => Number.isInteger(n) && n >= 1 && n <= 12)
      && Array.isArray(x.days) && x.days.length === 5 && x.days.every(d => Array.isArray(d) && d.every(s => plainText(s)))), "break.menus");
  }
  return bad;
}

// Day pictures in <dataDir>/cells*: only plain PNGs named by date, every one menu.json uses present.
export function checkCells(m, dataDir) {
  const bad = [];
  const days = [...Object.values(m.days || {}), ...Object.values((m.breakfast || {}).days || {})];
  const used = new Set(days.map(v => v && v.img).filter(Boolean));
  for (const dir of ["cells", "cells-breakfast"]) {
    const full = path.join(dataDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const rel = `${dir}/${f}`, p = path.join(full, f), st = fs.lstatSync(p);
      if (!st.isFile() || !PICTURE.test(rel)) { bad.push(`unexpected file ${rel}`); continue; }
      const why = pngProblem(fs.readFileSync(p));
      if (why) bad.push(`${rel}: ${why}`);
    }
  }
  for (const img of used) if (!fs.existsSync(path.join(dataDir, img))) bad.push(`missing picture ${img}`);
  return bad;
}

// Everything for one copy of the site's data: <webDir>/data/menu.json, its pictures, <webDir>/calendar.ics.
export function checkWeb(webDir) {
  let m;
  try { m = safeParse(fs.readFileSync(path.join(webDir, "data", "menu.json"), "utf8")); }
  catch (e) { return ["menu.json can't be read: " + e.message]; }
  const bad = checkMenu(m);
  if (bad.length) return bad;
  bad.push(...checkCells(m, path.join(webDir, "data")));
  let ics = null;
  try { ics = fs.readFileSync(path.join(webDir, "calendar.ics"), "utf8"); } catch (e) {}
  if (ics !== makeIcs(m, SITE)) bad.push("calendar.ics doesn't match menu.json");
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = checkWeb(path.join(ROOT, "web"));
  if (bad.length) { console.log("::error::The menu data failed its safety check:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log("Menu data checked: OK");
}
