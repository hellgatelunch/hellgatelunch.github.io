// Checks what the build wrote (web/data/menu.json, the day pictures and web/calendar.ics) before
// it's saved and published. The build reads the school's files, which we don't control, so the
// publish step trusts nothing it made: every field must have the expected shape, text must be
// plain and short, links must point at the school, and the calendar must be exactly what
// menu.json says. Uses only Node's own modules (no npm packages), so it runs before `npm ci`.
//
//   node menu/check.mjs            exits 1 and lists the problems if anything is off
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeIcs } from "./calendar.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://hellgatelunch.github.io/";
const PAGE_URL = "https://www.hellgate.k12.mt.us/departments/food-services/school-breakfast-lunch-program/k-8-food-menu";

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const keysIn = (o, allowed) => Object.keys(o).every(k => allowed.includes(k));

export function schoolUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.username && !x.password && !x.port
      && /^(resources\.finalsite\.net|(www\.)?hellgate\.k12\.mt\.us)$/i.test(x.hostname) && x.href === u;
  } catch (e) { return false; }
}

// Plain text from a menu: printable, no markup characters or control codes, sensible length.
export function plainText(s, max = 160) {
  return typeof s === "string" && s.length > 0 && s.length <= max && !/[<>\x00-\x1f\x7f]/.test(s) && !s.includes(String.fromCharCode(0x2028)) && !s.includes(String.fromCharCode(0x2029));
}

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
    for (const [mk, e] of Object.entries(d.months || {})) {
      need(MONTH.test(mk), `${name}.months key ${mk}`);
      need(isObj(e) && keysIn(e, ["name", "source", "cut", "ok"]), `${name}.months.${mk} fields`);
      if (!isObj(e)) continue;
      need(plainText(e.name, 40), `${name}.months.${mk}.name`);
      need(schoolUrl(e.source), `${name}.months.${mk}.source is not a school address`);
      need(DATE.test(e.cut), `${name}.months.${mk}.cut`);
      need(typeof e.ok === "boolean", `${name}.months.${mk}.ok`);
    }
    need(isObj(d.days) && Object.keys(d.days).length <= 100, `${name}.days`);
    const dir = name === "lunch" ? "cells" : "cells-breakfast";
    for (const [k, v] of Object.entries(d.days || {})) {
      need(DATE.test(k), `${name}.days key ${k}`);
      if (!isObj(v)) { bad.push(`${name}.days.${k} is not an object`); continue; }
      if ("items" in v) {
        need(keysIn(v, ["items"]) && Array.isArray(v.items) && v.items.length >= 1 && v.items.length <= 12
          && v.items.every(s => plainText(s)), `${name}.days.${k}.items`);
      } else if ("off" in v) {
        need(keysIn(v, ["off"]) && plainText(v.off, 80), `${name}.days.${k}.off`);
      } else {
        need(keysIn(v, ["img", "w", "h", "mask", "note"]) && v.img === `${dir}/${k}.png`
          && Number.isInteger(v.w) && Number.isInteger(v.h) && v.w > 0 && v.h > 0 && v.w < 5000 && v.h < 5000
          && v.mask === true && (v.note === undefined || v.note === true), `${name}.days.${k} picture`);
      }
    }
    need(Array.isArray(d.noLunch) && d.noLunch.length <= 100 && d.noLunch.every(k => DATE.test(k)), `${name}.noLunch`);
  };
  meal({ months: m.months, days: m.days, noLunch: m.noLunch }, "lunch");
  meal(m.breakfast, "breakfast");

  need(isObj(m.typed) && Object.entries(m.typed).every(([k, v]) => DATE.test(k)
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

// Day pictures: only "<date>.png" files that really are small PNGs, and only ones menu.json uses.
export function checkCells(m, dataDir) {
  const bad = [];
  const used = new Set([...Object.values(m.days || {}), ...Object.values((m.breakfast || {}).days || {})].map(v => v && v.img).filter(Boolean));
  for (const dir of ["cells", "cells-breakfast"]) {
    const full = path.join(dataDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const p = path.join(full, f), st = fs.lstatSync(p);
      if (f === ".gitkeep" && st.size === 0) continue;
      if (!st.isFile() || !/^\d{4}-\d\d-\d\d\.png$/.test(f)) { bad.push(`unexpected file ${dir}/${f}`); continue; }
      const head = fs.readFileSync(p).subarray(0, 8);
      if (st.size > 2 * 1024 * 1024 || !head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) bad.push(`${dir}/${f} is not a small PNG`);
    }
  }
  for (const img of used) if (!fs.existsSync(path.join(dataDir, img))) bad.push(`missing picture ${img}`);
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = path.join(ROOT, "web", "data");
  let m, bad;
  try { m = JSON.parse(fs.readFileSync(path.join(dataDir, "menu.json"), "utf8")); bad = checkMenu(m); }
  catch (e) { bad = ["menu.json can't be read: " + e.message]; }
  if (!bad.length) bad = checkCells(m, dataDir);
  if (!bad.length) {
    const ics = fs.readFileSync(path.join(ROOT, "web", "calendar.ics"), "utf8");
    if (ics !== makeIcs(m, SITE)) bad.push("calendar.ics doesn't match menu.json");
  }
  if (bad.length) { console.log("::error::The menu data failed its safety check:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log("Menu data checked: OK");
}
