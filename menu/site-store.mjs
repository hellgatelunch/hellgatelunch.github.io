// The Netlify side of the menu: refreshes it into a Netlify Blobs store, and serves it.
// The store is passed in (getStore("menu") on Netlify, a stand-in in the tests).
//
// Keys in the store:  menu.json · calendar.ics · status.json · cells/<date>.png · cells-breakfast/<date>.png
// Until the first refresh has run, the copies bundled with the site (web/data, web/calendar.ics) are used.
import fs from "node:fs";
import path from "node:path";
import { refresh } from "./pipeline.mjs";
import { checkMenu } from "./check.mjs";
import { makeIcs } from "./calendar.mjs";
import { PICTURE, pngProblem, safeParse } from "./schema.mjs";

import { ROOT } from "../lib/root.mjs";
export const SITE = "https://hawkslunch.netlify.app/";

const readOr = (p, fallback) => { try { return fs.readFileSync(p); } catch (e) { return fallback; } };

// The menu files bundled with the site, as a fallback and a starting point.
export function bundled() {
  const cells = new Map();
  for (const dir of ["cells", "cells-breakfast"]) {
    const full = path.join(ROOT, "web", "data", dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (PICTURE.test(`${dir}/${f}`)) cells.set(`${dir}/${f}`, fs.readFileSync(path.join(full, f)));
  }
  const menu = readOr(path.join(ROOT, "web", "data", "menu.json"), null);
  return { menu: menu ? menu.toString("utf8") : null, ics: (readOr(path.join(ROOT, "web", "calendar.ics"), null) || "").toString("utf8") || null, cells };
}

const toArrayBuffer = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
async function getText(store, key) { const v = await store.get(key, { type: "text" }); return v == null ? null : v; }
async function getBytes(store, key) { const v = await store.get(key, { type: "arrayBuffer" }); return v == null ? null : Buffer.from(v); }

// One scheduled run. Never leaves the store half-updated in a way the app can see: pictures are
// written before the menu that uses them, and dropped pictures are removed after it.
export async function runRefresh({ store, site = SITE, now = new Date(), page, file, purge, log = console.log, seed = bundled() }) {
  const started = now.toISOString();
  const status = async (ok, changed, message) => {
    await store.set("status.json", JSON.stringify({ lastRun: started, ok, changed, message }));
    return { ok, changed, message };
  };

  let prevText = await getText(store, "menu.json");
  const prevIcs = prevText ? await getText(store, "calendar.ics") : seed.ics;
  let cells;
  if (prevText) {
    cells = new Map();
    const { blobs } = await store.list();
    for (const b of blobs) if (PICTURE.test(b.key)) cells.set(b.key, await getBytes(store, b.key));
  } else {
    prevText = seed.menu;
    cells = new Map(seed.cells);
  }
  let prev = {};
  try { prev = prevText ? safeParse(prevText) : {}; } catch (e) { prev = {}; }
  const breakJson = safeParse(fs.readFileSync(path.join(ROOT, "menu", "break.json"), "utf8"));

  const res = await refresh({ prev, cells, breakJson, now, site, page, file, log });
  if (!res.ok) return status(false, false, res.reason);

  // The same checks as before publishing on GitHub: refuse anything odd and keep the old menu.
  const problems = checkMenu(res.menu);
  for (const [k, buf] of res.cells) {
    if (!PICTURE.test(k)) problems.push(`unexpected picture name ${k}`);
    else { const why = pngProblem(buf); if (why) problems.push(`${k}: ${why}`); }
  }
  const used = [...Object.values(res.menu.days), ...Object.values(res.menu.breakfast.days)].map(v => v && v.img).filter(Boolean);
  for (const img of used) if (!res.cells.has(img)) problems.push(`missing picture ${img}`);
  if (res.ics !== makeIcs(res.menu, site)) problems.push("calendar doesn't match the menu");
  if (problems.length) return status(false, false, "The new menu failed its safety check; keeping the old one: " + problems.join("; "));

  const menuText = JSON.stringify(res.menu, null, 1) + "\n";
  const newCells = [...res.cells].filter(([k, buf]) => !cells.has(k) || !cells.get(k).equals(buf));
  const goneCells = [...cells.keys()].filter(k => !res.cells.has(k));
  const firstRun = !(await getText(store, "menu.json"));
  const changed = firstRun || menuText !== prevText || res.ics !== prevIcs || newCells.length > 0 || goneCells.length > 0;
  if (!changed) return status(true, false, "No menu changes.");

  for (const [k, buf] of firstRun ? [...res.cells] : newCells) await store.set(k, toArrayBuffer(buf));
  await store.set("menu.json", menuText);
  await store.set("calendar.ics", res.ics);
  for (const k of goneCells) await store.delete(k);
  if (purge) { try { await purge(); } catch (e) { log("Couldn't clear the cache: " + e.message); } }
  return status(true, true, `Menu updated: ${Object.keys(res.menu.days).length} lunch days, ${Object.keys(res.menu.breakfast.days).length} breakfast days.`);
}

// Serving: only these exact paths, each from the store (or the bundled copy before the first run).
const TYPES = { json: "application/json; charset=utf-8", ics: "text/calendar; charset=utf-8", png: "image/png" };
export function keyFor(pathname) {
  if (pathname === "/data/menu.json") return "menu.json";
  if (pathname === "/data/status.json") return "status.json";
  if (pathname === "/calendar.ics") return "calendar.ics";
  const m = /^\/data\/(cells(?:-breakfast)?\/\d{4}-\d\d-\d\d\.png)$/.exec(pathname);
  return m && PICTURE.test(m[1]) ? m[1] : null;
}

export async function serve({ store, pathname, seed }) {
  const key = keyFor(pathname);
  if (!key) return { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };
  const type = TYPES[key.split(".").pop()];
  let body = key.endsWith(".png") ? await getBytes(store, key) : await getText(store, key);
  if (body == null) {
    const s = seed || bundled();
    body = key === "menu.json" ? s.menu : key === "calendar.ics" ? s.ics : key === "status.json" ? JSON.stringify({ lastRun: null, ok: true, changed: false, message: "Waiting for the first scheduled refresh." }) : s.cells.get(key) || null;
  }
  if (body == null) return { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };
  return { status: 200, body, type };
}
