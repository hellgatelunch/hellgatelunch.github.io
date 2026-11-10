// Off-phone tests for hellgate-lunch.js. Run with: npm test
// Fixtures are real copies of the school's page and its November 2026 lunch and breakfast menus (fetched Nov 9, 2026).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadCore, loadSection, readPng, flatten, writeCrop, FIXTURES, OUT } from "../lib/script-parts.mjs";

let failed = 0;
function test(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}

const page = fs.readFileSync(path.join(FIXTURES, "k8-menu-page.html"), "utf8");
const links = loadSection("// ---------- reading the school's page", "// ---------- finding the calendar grid",
  ["extractLinks", "isLunch", "monthOf", "describe", "newMenus", "original", "rendition"]);
const blank = () => ({ src: {}, file: {}, unreadable: {}, noLunch: {}, lastCheck: 0, waiting: null });

console.log("Finding the menu on the school's page");

test("finds the November lunch PDF hidden in the <img> data", () => {
  const lunch = links.extractLinks(page, "https://www.hellgate.k12.mt.us/x").filter(links.isLunch);
  assert.equal(lunch.length, 1, JSON.stringify(lunch, null, 1));
  assert.equal(lunch[0].url, "https://resources.finalsite.net/images/v1793201331/hellgatek12mtus/q36shaaq4eujy03daxtg/NovemberLUNCH2026docx.pdf");
  assert.equal(lunch[0].render, "https://resources.finalsite.net/images/f_auto,q_auto/v1793201331/hellgatek12mtus/q36shaaq4eujy03daxtg/NovemberLUNCH2026docx.pdf");
  assert.match(lunch[0].text, /NovemberLUNCH2026/);
});

test("no glued-together addresses", () => {
  for (const l of links.extractLinks(page, "https://www.hellgate.k12.mt.us/x")) {
    assert.ok(!/%22|\},\{|https?:.*https?:/.test(l.url), l.url);
  }
});

test("breakfast menus are ignored", () => {
  const all = links.extractLinks(page, "https://www.hellgate.k12.mt.us/x");
  assert.ok(all.some(l => /BREAKFAST/i.test(l.url)));
  assert.ok(!all.filter(links.isLunch).some(l => /breakfast/i.test(l.url)));
});

test("year comes from the file name, not the version stamp", () => {
  const l = { text: "", url: "https://resources.finalsite.net/images/v1793201331/hellgatek12mtus/q36shaaq4eujy03daxtg/DecemberLUNCH.pdf" };
  assert.deepEqual({ ...links.monthOf(links.describe(l), new Date(2026, 10, 20)) }, { year: 2026, month: 11 });
  const j = { text: "", url: "https://resources.finalsite.net/images/v1799999999/hellgatek12mtus/abc/JanuaryLUNCH2027docx.pdf" };
  assert.deepEqual({ ...links.monthOf(links.describe(j), new Date(2026, 11, 20)) }, { year: 2027, month: 0 });
});

test("November is typed in, so nothing to load on Nov 9", () => {
  const all = links.extractLinks(page, "https://www.hellgate.k12.mt.us/x");
  assert.equal(links.newMenus(all, blank(), new Date(2026, 10, 9, 10)).length, 0);
});

const decPage = page.replace(/NovemberLUNCH2026/g, "DecemberLUNCH2026").replace(/v1793201331/g, "v1795000000");
test("a posted December menu is picked up in late November", () => {
  const all = links.extractLinks(decPage, "https://www.hellgate.k12.mt.us/x");
  const todo = links.newMenus(all, blank(), new Date(2026, 10, 25, 9));
  assert.equal(todo.length, 1);
  assert.equal(todo[0].mk, "2026-12");
  assert.match(todo[0].render, /\/f_auto,q_auto\/v1795000000\//);
});

test("an already-loaded December is not loaded again, a re-upload is", () => {
  const all = links.extractLinks(decPage, "https://www.hellgate.k12.mt.us/x");
  const s = blank();
  s.src["2026-12"] = links.newMenus(all, blank(), new Date(2026, 10, 25))[0].url;
  assert.equal(links.newMenus(all, s, new Date(2026, 10, 25)).length, 0);
  const reup = links.extractLinks(decPage.replace(/v1795000000/g, "v1795111111"), "https://www.hellgate.k12.mt.us/x");
  assert.equal(links.newMenus(reup, s, new Date(2026, 10, 25)).length, 1);
});

test("a plain <a> link to a PDF still works", () => {
  const html = '<a href="/uploads/Lunch%20Menu%20January%202027.pdf">January Lunch</a>';
  const todo = links.newMenus(links.extractLinks(html, "https://www.hellgate.k12.mt.us/x"), blank(), new Date(2026, 11, 28));
  assert.equal(todo.length, 1);
  assert.equal(todo[0].mk, "2027-01");
  assert.equal(todo[0].render, null);
});

console.log("Picking the day");

function picker(cells = [], noLunch = {}) {
  return loadSection("// ---------- which day to show", "// ---------- reading the school's page", ["pick"],
    { hasCell: k => cells.includes(k) }).pick;
}
const s0 = { noLunch: {} };

test("before 2 PM: today", () => {
  const p = picker()(new Date(2026, 10, 9, 13, 59), s0);
  assert.equal(p.label, "Today"); assert.equal(p.items[0], "Orange Chicken/Rice");
});
test("after 2 PM: tomorrow", () => {
  const p = picker()(new Date(2026, 10, 9, 14, 0), s0);
  assert.equal(p.label, "Tomorrow"); assert.equal(p.items[0], "Cheeseburger");
});
test("Friday afternoon: Monday", () => {
  const p = picker()(new Date(2026, 10, 13, 15), s0);
  assert.equal(p.label, "Mon, Nov 16"); assert.equal(p.items[0], "Beef Meatball Sub/Cheese");
});
test("skips Thanksgiving break", () => {
  const p = picker()(new Date(2026, 10, 24, 15), s0);
  assert.equal(p.label, "Mon, Nov 30"); assert.equal(p.items[0], "Beef Burrito");
});
test("December not loaded: says so", () => {
  const p = picker()(new Date(2026, 10, 30, 15), s0);
  assert.equal(p.label, "Lunch"); assert.equal(p.day.getMonth(), 11); assert.equal(p.day.getDate(), 1);
});
test("December loaded: shows the school's box", () => {
  const p = picker(["2026-12-01"])(new Date(2026, 10, 30, 15), s0);
  assert.equal(p.cell, "2026-12-01"); assert.equal(p.label, "Tomorrow");
});
test("skips a day with no lunch written", () => {
  const p = picker(["2026-12-02"])(new Date(2026, 10, 30, 15), { noLunch: { "2026-12-01": true } });
  assert.equal(p.cell, "2026-12-02"); assert.equal(p.label, "Wed, Dec 2");
});

console.log("Cutting boxes out of the real November menu");

const core = loadCore();
const img = flatten(readPng(path.join(FIXTURES, "november-2026.png")));
const grid = core.gridFind(img.data, img.w, img.h);

test("finds 5 columns and 5 week rows below the header", () => {
  assert.ok(grid, "no grid");
  assert.deepEqual([...grid.xs], [32, 348, 665, 982, 1300, 1617]);
  assert.equal(grid.ys.length, 7); // header top, header bottom, then 5 row lines
});

test("every November weekday gets the right box, without the date number", () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (let d = 1; d <= 30; d++) {
    const dow = new Date(2026, 10, d).getDay();
    const b = core.boxFor(grid, 2026, 10, d);
    if (dow === 0 || dow === 6) { assert.equal(b, null, "weekend " + d); continue; }
    assert.ok(b, "no box for " + d);
    const col = (dow + 6) % 7;
    assert.ok(b.x > grid.xs[col] && b.x + b.w < grid.xs[col + 1], "column for " + d);
    const t = core.trimBox(img.data, img.w, b);
    assert.ok(t, "blank box for " + d);
    // The date number sits ~10-30px under the box top; the cut must start below it.
    assert.ok(t.y - b.y > 25, `date number left in ${d} (top ${t.y - b.y}px)`);
    writeCrop(img, t, path.join(OUT, `2026-11-${String(d).padStart(2, "0")}.png`));
  }
});

test("a box with only its date number counts as no lunch", () => {
  // Wipe Monday Nov 30's food lines, keep the "30".
  const copy = { ...img, data: Buffer.from(img.data) };
  const b = core.boxFor(grid, 2026, 10, 30);
  for (let y = b.y + 25; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) copy.data.fill(255, (y * img.w + x) * 4, (y * img.w + x) * 4 + 3);
  assert.equal(core.trimBox(copy.data, img.w, b), null);
});

test("weeks for months starting on a weekend", () => {
  assert.equal(core.weekRow(2026, 7, 3), 0);  // Aug 2026 starts Saturday
  assert.equal(core.weekRow(2026, 1, 2), 0);  // Feb 2026 starts Sunday
  assert.equal(core.weekRow(2026, 9, 1), 0);  // Oct 2026 starts Thursday
  assert.equal(core.weekRow(2026, 9, 5), 1);
});

console.log("Breakfast and Breakfast @ Break (website)");

const { sortLinks } = await import("../menu/sources.mjs");
const all = links.extractLinks(page, "https://www.hellgate.k12.mt.us/x");
const sortedLinks = sortLinks(all, new Date(2026, 10, 9));

test("the page's three menus are told apart", () => {
  assert.deepEqual(Array.from(sortedLinks.lunch, l => l.url.split("/").pop()), ["NovemberLUNCH2026docx.pdf"]);
  assert.deepEqual(Array.from(sortedLinks.breakfast, l => l.url.split("/").pop()), ["November2026BREAKFASTdocx.pdf"]);
  assert.equal(sortedLinks.breakfast[0].mk, "2026-11");
  assert.match(sortedLinks.breakfast[0].render, /\/f_auto,q_auto\/v1793201252\//);
  assert.equal(sortedLinks.breakSheet.url.split("/").pop(), "BreakfastBreakMiddleSchool2026.pdf");
});

test("the typed-in Breakfast @ Break sheet is the one on the school's page", () => {
  const br = JSON.parse(fs.readFileSync(new URL("../menu/break.json", import.meta.url), "utf8"));
  assert.equal(br.source, sortedLinks.breakSheet.url);
});

test("Breakfast @ Break covers each school month once, Monday to Friday", () => {
  const br = JSON.parse(fs.readFileSync(new URL("../menu/break.json", import.meta.url), "utf8"));
  const months = br.menus.flatMap(m => m.months).sort((a, b) => a - b);
  assert.deepEqual(months, [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
  for (const m of br.menus) {
    assert.equal(m.days.length, 5);
    for (const d of m.days) assert.ok(d.length >= 1 && d.every(x => typeof x === "string" && x));
  }
  assert.deepEqual(br.menus[0].days[1], ["Mini Pancakes", "Yogurt"]); // Tuesday, Nov 2026 sheet
});

const bimg = flatten(readPng(path.join(FIXTURES, "november-2026-breakfast.png")));
const bgrid = core.gridFind(bimg.data, bimg.w, bimg.h);

test("finds the breakfast calendar's columns and weeks", () => {
  assert.ok(bgrid, "no grid");
  assert.deepEqual([...bgrid.xs], [53, 369, 688, 1005, 1321, 1638]);
  assert.ok(bgrid.ys.length >= 7); // the grey rule under the table adds one harmless line
});

test("every November breakfast day gets a box; Thanksgiving break reads as a note", () => {
  for (let d = 1; d <= 30; d++) {
    if ([0, 6].includes(new Date(2026, 10, d).getDay())) continue;
    const b = core.boxFor(bgrid, 2026, 10, d);
    assert.ok(b, "no box for " + d);
    const t = core.trimBox(bimg.data, bimg.w, b);
    assert.ok(t, "blank box for " + d);
    assert.ok(t.y - b.y > 25, `date number left in ${d}`);
    const note = t.h < t.w * 0.3;
    assert.equal(note, [25, 26, 27].includes(d), `note? ${d}`);
    writeCrop(bimg, t, path.join(OUT, `breakfast-2026-11-${String(d).padStart(2, "0")}.png`));
  }
});

console.log(failed ? `\n${failed} failed` : "\nAll passed. Day crops are in test/out/.");
process.exit(failed ? 1 : 0);
