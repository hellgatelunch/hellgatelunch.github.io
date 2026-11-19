// Reads the school's menus into the website's menu data, entirely in memory, so the same code
// runs from the command line (menu/build.mjs, which saves files) and on Netlify
// (netlify/functions/refresh-menu.mjs, which saves to Netlify Blobs).
//
//   refresh({ prev, cells, breakJson, now, site, force, page, file, log })
//     prev       last menu.json object ({} for none)
//     cells      Map of day pictures, "cells/2026-11-02.png" → PNG bytes (left untouched; a new Map is returned)
//     breakJson  menu/break.json
//     page()     the school's menu page HTML (default: fetched)
//     file(meal, kind, item)  optional override for a menu file (kind "render" or "pdf"); return null to fetch
//   → { ok: false, reason } when the school's page can't be read (keep the old menu), or
//     { ok: true, menu, ics, cells }
import { PNG } from "pngjs";
import { readMonth } from "./read-month.mjs";
import { S, sortLinks } from "./sources.mjs";
import { makeIcs } from "./calendar.mjs";
import { schoolUrl, cleanText } from "./schema.mjs";

const UA = "Mozilla/5.0 (compatible; hawks-lunch/1.0)";
const MEALS = {
  lunch: { label: "Lunch", dir: "cells" },
  breakfast: { label: "Breakfast", dir: "cells-breakfast" },
};

// Only the school's own site and its file host are ever fetched (https, size-capped), so a stray
// link on the school's page can't make the build download something from anywhere else.
// The cap counts bytes as they arrive after decompression, so a small compressed "bomb" can't
// blow up past it, and each run fetches at most MAX_FETCHES files.
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_FETCHES = 20;
export const schoolHost = url => schoolUrl(url) || schoolUrl(safeHref(url));
function safeHref(u) { try { return new URL(u).href; } catch (e) { return null; } }

// A downloader for one run (its own download count).
export function makeGetter() {
  let fetches = 0;
  return async function get(url, accept) {
    if (!schoolHost(url)) throw new Error(`not a school address: ${url}`);
    if (++fetches > MAX_FETCHES) throw new Error("too many downloads in one run");
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": accept || "*/*" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status} for ${url}`);
    if (!schoolHost(r.url)) throw new Error(`redirected away from the school: ${r.url}`);
    if (+r.headers.get("content-length") > MAX_BYTES) throw new Error(`too big: ${url}`);
    const parts = [];
    let total = 0;
    for await (const chunk of r.body) {
      total += chunk.length;
      if (total > MAX_BYTES) { await r.body.cancel().catch(() => {}); throw new Error(`too big: ${url}`); }
      parts.push(chunk);
    }
    return Buffer.concat(parts.map(c => Buffer.from(c)));
  };
}

// A PNG's size from its header, before decoding it (refuse absurd sizes).
function pngSizeOk(buf) {
  if (buf.length < 24) return false;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w > 0 && h > 0 && w <= 6000 && h <= 6000;
}

const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
// Every string written out is NFC with invisible, direction-changing and control characters
// removed (the school's PDFs sometimes carry them), so the checks before publishing pass on real menus.
function clean(v) {
  if (typeof v === "string") return cleanText(v);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  return v;
}
const mealOut = d => ({ months: sorted(d.months), days: sorted(d.days), noLunch: [...new Set(d.noLunch)].sort() });
const copyMeal = d => ({ months: { ...(d && d.months) }, days: { ...(d && d.days) }, noLunch: [...((d && d.noLunch) || [])] });

export async function refresh({ prev = {}, cells = new Map(), breakJson = {}, now = new Date(), site, force = false, page, file, log = console.log }) {
  const get = makeGetter();
  const out = new Map(cells);
  const lunch = copyMeal(prev);
  const breakfast = copyMeal(prev.breakfast);

  let html;
  try { html = page ? await page() : (await get(S.PAGE_URL, "text/html")).toString("utf8"); }
  catch (e) { return { ok: false, reason: `Couldn't reach the school's menu page (${e.message}). Keeping the saved menu.` }; }
  const sortedLinks = sortLinks(S.extractLinks(html, S.PAGE_URL).filter(l => schoolHost(l.url)), now);

  // Last month, this month, next month.
  const wanted = [-1, 0, 1].map(o => { const d = new Date(now.getFullYear(), now.getMonth() + o, 1); return S.monthKey(d.getFullYear(), d.getMonth()); });

  async function updateMeal(meal, links, data) {
    const { label, dir } = MEALS[meal];
    const found = {};
    for (const l of links) if (wanted.includes(l.mk) && !found[l.mk]) found[l.mk] = l;
    log(`${label} menus on the school's page: ${Object.keys(found).join(", ") || "none"}`);

    for (const item of Object.values(found)) {
      const name = `${S.MON_LONG[item.month]} ${item.year}`;
      if (!force && data.months[item.mk] && data.months[item.mk].source === item.url) { log(`  ${name}: already cut`); continue; }
      let buf, pdf = null;
      try { buf = (file && await file(meal, "render", item)) || await get(item.render || item.url, S.ACCEPT); }
      catch (e) { log(`  ${name}: download failed (${e.message}), will retry next run`); continue; }
      // The original PDF, for its words. Without it, days fall back to pictures.
      try {
        pdf = (file && await file(meal, "pdf", item)) || await get(item.url, "application/pdf");
        if (pdf.subarray(0, 4).toString("latin1") !== "%PDF") pdf = null;
      } catch (e) { pdf = null; }
      const entry = { name, source: item.url, cut: now.toISOString().slice(0, 10) };
      // Drop this month's old days and pictures, then cut the new ones.
      for (const k of Object.keys(data.days)) if (k.startsWith(item.mk)) delete data.days[k];
      data.noLunch = data.noLunch.filter(k => !k.startsWith(item.mk));
      for (const k of [...out.keys()]) if (k.startsWith(`${dir}/${item.mk}`)) out.delete(k);
      let res = null;
      if (buf.subarray(0, 4).toString("latin1") === "\x89PNG" && pngSizeOk(buf)) res = await readMonth(PNG.sync.read(buf), pdf, item.year, item.month);
      if (res && Object.keys(res.days).length) {
        for (const [k, day] of Object.entries(res.days)) {
          if (!day.picture) continue;
          out.set(`${dir}/${k}.png`, day.picture);
          res.days[k] = { img: `${dir}/${k}.png`, w: day.w, h: day.h, mask: true, ...(day.note ? { note: true } : {}) };
        }
        Object.assign(data.days, res.days);
        data.noLunch.push(...res.noLunch);
        entry.ok = true;
        log(`  ${name}: ${res.fromText} days as text, ${res.fromPictures} as pictures` + (res.noLunch.length ? `, ${res.noLunch.length} with nothing written` : ""));
        if (res.fromPictures) log(`::notice::${label} ${name}: ${res.fromPictures} days couldn't be read as text and are shown as pictures.`);
      } else {
        entry.ok = false;
        log(`::warning::${label} ${name} is posted, but its layout couldn't be read.`);
      }
      data.months[item.mk] = entry;
    }

    // Forget months older than last month.
    for (const mk of Object.keys(data.months)) if (mk < wanted[0]) delete data.months[mk];
    for (const k of Object.keys(data.days)) if (k.slice(0, 7) < wanted[0]) delete data.days[k];
    data.noLunch = data.noLunch.filter(k => k.slice(0, 7) >= wanted[0]);
    for (const k of [...out.keys()]) if (k.startsWith(dir + "/") && k.slice(dir.length + 1, dir.length + 8) < wanted[0]) out.delete(k);
  }

  await updateMeal("lunch", sortedLinks.lunch, lunch);
  await updateMeal("breakfast", sortedLinks.breakfast, breakfast);

  // Lunch days typed into lib/school-menu.js are shown as text.
  const typed = {};
  for (const [k, v] of Object.entries(S.MENU)) if (k.slice(0, 7) >= wanted[0]) typed[k] = v;

  // Breakfast @ Break is typed in (menu/break.json). Warn if the school posts a different sheet.
  const br = breakJson || {};
  const posted = sortedLinks.breakSheet ? sortedLinks.breakSheet.url : null;
  const changed = !!posted && posted !== br.source;
  if (changed) log(`::warning::The school posted a new Breakfast @ Break sheet: ${posted}. Update menu/break.json from it.`);
  log(`Breakfast @ Break: ${posted ? (changed ? "school posted a NEW sheet" : "matches the typed-in sheet") : "sheet not on the page"}`);

  const menu = clean({
    page: S.PAGE_URL,
    // Lunch stays at the top level so older cached copies of the app keep working.
    ...mealOut(lunch),
    typed: sorted(typed),
    breakfast: mealOut(breakfast),
    break: { note: br.note, always: br.always, menus: br.menus, source: br.source, ...(changed ? { newSheet: posted } : {}) },
  });
  return { ok: true, menu, ics: makeIcs(menu, site), cells: out };
}
