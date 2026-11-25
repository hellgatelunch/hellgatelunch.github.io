// Off-phone tests for the website build (lib/school-menu.js, menu/) and the iPhone widget (hellgate-lunch.js). Run with: npm test
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

console.log("Reading words from the school's PDFs (website)");

async function testAsync(name, fn) {
  try { await fn(); console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message.split("\n").join("\n       ")); }
}
const { readMonth } = await import("../menu/read-month.mjs");
const { toMeal } = await import("../menu/pdf-text.mjs");
const { S } = await import("../menu/sources.mjs");
const { PNG } = await import("pngjs");
const pngOf = f => PNG.sync.read(fs.readFileSync(path.join(FIXTURES, f)));
const pdfOf = f => fs.readFileSync(path.join(FIXTURES, f));

test("a box's lines become a meal", () => {
  assert.deepEqual(toMeal(["3", "Breakfast Nacho Bar;", "Add Your Own Toppings!", "Mixed Fruit"]),
    { items: ["Breakfast Nacho Bar; Add Your Own Toppings!", "Mixed Fruit"] });
  assert.deepEqual(toMeal(["2", "Apple Frudel Stick", "Tri Tater", "Juice", "`"]), { items: ["Apple Frudel Stick", "Tri Tater", "Juice"] });
  assert.deepEqual(toMeal(["25", "NO SCHOOL"]), { off: "No school" });
  assert.equal(toMeal(["25"]), null);
});

await testAsync("lunch words from the PDF match the typed-in November menu, every day", async () => {
  const res = await readMonth(pngOf("november-2026.png"), pdfOf("november-2026.pdf"), 2026, 10);
  assert.equal(res.fromPictures, 0);
  for (const [k, typed] of Object.entries(S.MENU)) {
    if (!k.startsWith("2026-11")) continue;
    const got = res.days[k];
    if (typed === null) assert.deepEqual({ ...got }, { off: "No school" }, k);
    else assert.deepEqual([...got.items], [...typed], k);
  }
});

await testAsync("breakfast words from the PDF", async () => {
  const res = await readMonth(pngOf("november-2026-breakfast.png"), pdfOf("november-2026-breakfast.pdf"), 2026, 10);
  assert.equal(res.fromText, 21);
  assert.deepEqual([...res.days["2026-11-10"].items], ["Yogurt Bar; Add Your Own Toppings!", "Mini Donuts", "Mixed Berries"]);
  assert.deepEqual([...res.days["2026-11-02"].items], ["Apple Frudel Stick", "Tri Tater", "Juice"]);
  assert.deepEqual([...res.days["2026-11-19"].items], ["Chocolate Donut", "Turkey Sausage Patty", "Apple Slices"]);
  for (const d of ["25", "26", "27"]) assert.equal(res.days["2026-11-" + d].off, "No school");
});

await testAsync("December breakfast: a tall green header band and a colored note above it; a winter break banner", async () => {
  // The day names sit in white inside a soft green band, and an orange note runs above the calendar.
  // Both used to shift every week up one row (Dec 1 read "Tuesday", Dec 7-11 came out as pictures).
  const res = await readMonth(pngOf("december-2026-breakfast.png"), pdfOf("december-2026-breakfast.pdf"), 2026, 11);
  assert.equal(res.fromPictures, 0);
  assert.deepEqual([...res.days["2026-12-01"].items], ["Chocolate Chip Oatmeal Bar", "Cheddar Cheese Stick", "Pears"]);
  assert.deepEqual([...res.days["2026-12-07"].items], ["Biscuits & Sausage Gravy", "Tri Tater", "Juice"]);
  assert.deepEqual([...res.days["2026-12-11"].items], ["Cereal", "Yogurt", "Pears"]);
  assert.deepEqual([...res.days["2026-12-18"].items], ["Cereal", "Cheddar Cheese Stick", "Variety Fruits"]);
  // "WINTER" | "BREAK" and "SEE YOU BACK" | "JANUARY 4th" are written across the boxes.
  assert.equal(res.days["2026-12-22"].off, "Winter break");
  assert.equal(res.days["2026-12-23"].off, "Winter break");
  assert.equal(res.days["2026-12-30"].off, "See you back January 4th");
});

await testAsync("without readable words, a day falls back to a see-through picture", async () => {
  const res = await readMonth(pngOf("november-2026-breakfast.png"), null, 2026, 10);
  assert.equal(res.fromPictures, 21);
  const p = PNG.sync.read(res.days["2026-11-10"].picture);
  assert.equal(p.data[3], 0, "paper should be transparent");
  let ink = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 200) ink++;
  assert.ok(ink > 500, "ink should be opaque");
  assert.ok(res.days["2026-11-25"].note, "NO SCHOOL box is a note");
});

console.log("Calendar feed (website)");

{
  const { makeIcs } = await import("../menu/calendar.mjs");
  const ICAL = (await import("ical.js")).default;
  const lunchRes = await readMonth(pngOf("november-2026.png"), pdfOf("november-2026.pdf"), 2026, 10);
  const bfRes = await readMonth(pngOf("november-2026-breakfast.png"), pdfOf("november-2026-breakfast.pdf"), 2026, 10);
  const br = JSON.parse(fs.readFileSync(new URL("../menu/break.json", import.meta.url), "utf8"));
  const menu = {
    months: { "2026-11": { name: "November 2026", cut: "2026-11-09", ok: true } },
    days: lunchRes.days, noLunch: lunchRes.noLunch, typed: {},
    breakfast: { months: { "2026-11": { name: "November 2026", cut: "2026-11-09", ok: true } }, days: bfRes.days, noLunch: [] },
    break: br,
  };
  const ics = makeIcs(menu, "https://hellgatelunch.github.io/");
  const events = new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent").map(e => new ICAL.Event(e));

  test("the feed parses as a calendar, one event per November school day", () => {
    assert.equal(events.length, 18);
    const days = events.map(e => e.startDate.toString());
    for (const off of ["2026-11-25", "2026-11-26", "2026-11-27"]) assert.ok(!days.includes(off), off);
    assert.ok(events.every(e => e.startDate.isDate), "all-day events");
  });

  test("Nov 10: lunch in the title, the whole day in the notes", () => {
    const e = events.find(x => x.startDate.toString() === "2026-11-10");
    assert.equal(e.summary, "Lunch: Cheeseburger");
    assert.match(e.description, /^Breakfast: Yogurt Bar; Add Your Own Toppings! · Mini Donuts · Mixed Berries$/m);
    assert.match(e.description, /^Break \(middle school\): Mini Pancakes · Yogurt · Fruits · Milk$/m);
    assert.match(e.description, /^Lunch: Cheeseburger · Oven Fries · Strawberries$/m);
    assert.equal(e.uid, "20261110@hellgatelunch.github.io");
  });

  test("lines are CRLF, at most 75 octets, with commas and semicolons escaped", () => {
    assert.ok(!/[^\r]\n/.test(ics), "bare LF");
    for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
    assert.match(ics, /Yogurt Bar\\; Add/);
    assert.match(ics, /^X-WR-CALNAME:Hawks Lunch\r$/m);
  });

  test("the same menu always gives the same feed (no needless commits)", () => {
    assert.equal(makeIcs(menu, "https://hellgatelunch.github.io/"), ics);
  });
}

console.log("iPhone widget (hellgate-lunch.js, with a stand-in for Scriptable)");

{
  const { loadWidgetSection, WIDGET_PATH } = await import("../lib/script-parts.mjs");
  const vm = await import("node:vm");
  const menu = JSON.parse(fs.readFileSync(path.join(FIXTURES, "menu-2026-11.json"), "utf8"));
  const W = loadWidgetSection("// ---------- picking the day", "// ---------- widget", ["parseMeals", "pick", "mealFor", "mealText"]);

  test("widget parameter picks the meals", () => {
    assert.deepEqual([...W.parseMeals("")], ["breakfast", "lunch"]);
    assert.deepEqual([...W.parseMeals(null)], ["breakfast", "lunch"]);
    assert.deepEqual([...W.parseMeals("Lunch")], ["lunch"]);
    assert.deepEqual([...W.parseMeals("all")], ["breakfast", "break", "lunch"]);
    assert.deepEqual([...W.parseMeals("breakfast, break")], ["breakfast", "break"]);
    assert.deepEqual([...W.parseMeals("nonsense")], ["breakfast", "lunch"]);
  });

  test("widget picks the day like the website", () => {
    let p = W.pick(menu, new Date(2026, 10, 10, 7));
    assert.equal(p.label, "Today · Tue");
    assert.equal(W.mealFor(menu, "breakfast", p.day).items[0], "Yogurt Bar; Add Your Own Toppings!");
    assert.equal(W.mealFor(menu, "lunch", p.day).items[0], "Cheeseburger");
    assert.equal(W.mealFor(menu, "break", p.day).items[0], "Mini Pancakes");
    p = W.pick(menu, new Date(2026, 10, 9, 15));
    assert.equal(p.label, "Tomorrow · Tue");
    p = W.pick(menu, new Date(2026, 10, 24, 15));
    assert.equal(p.label, "Mon, Nov 30");
    p = W.pick(menu, new Date(2026, 10, 30, 15));
    assert.equal(p.ok, false);
    assert.equal(p.day.getMonth(), 11);
  });

  // A stand-in for the bits of Scriptable the widget uses. It records what the widget draws.
  function fakeScriptable({ now, param, family, inWidget = true, online = true, files = new Map() }) {
    const texts = [], calls = { setWidget: 0, present: 0 };
    class Stack {
      constructor() { this.items = []; }
      addStack() { const s = new Stack(); this.items.push(s); return s; }
      addText(t) { const x = { text: String(t) }; texts.push(x); this.items.push(x); return x; }
      addSpacer() {} setPadding() {} layoutHorizontally() {} layoutVertically() {}
    }
    class ListWidget extends Stack { async presentMedium() { calls.present++; } }
    class Color { constructor(h) { this.hex = h; } static dynamic(a, b) { return { light: a, dark: b }; } }
    const font = n => s => ({ name: n, size: s });
    const Font = { heavySystemFont: font("heavy"), boldSystemFont: font("bold"), semiboldSystemFont: font("semibold"), systemFont: font("regular") };
    class Request { constructor(u) { this.url = u; } async loadJSON() { if (!online) throw new Error("offline"); assert.equal(this.url, "https://hawkslunch.netlify.app/data/menu.json"); return JSON.parse(JSON.stringify(menu)); } }
    const fmApi = {
      documentsDirectory: () => "/docs", joinPath: (a, b) => a + "/" + b,
      fileExists: p => files.has(p) || p === "/docs/hellgate-lunch", createDirectory() {},
      writeString: (p, s) => files.set(p, s), readString: p => { if (!files.has(p)) throw new Error("no file"); return files.get(p); },
      listContents: () => [...files.keys()].map(k => k.split("/").pop()), remove: p => files.delete("/docs/hellgate-lunch/" + p.split("/").pop()),
    };
    const FIXED = now.getTime();
    class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } }
    let widget = null;
    const ctx = {
      console, JSON, Math, Object, String, RegExp, Promise, Error, Date: FakeDate,
      ListWidget, Color, Font, Request, FileManager: { local: () => fmApi },
      config: { runsInWidget: inWidget, widgetFamily: family }, args: { widgetParameter: param },
      Script: { setWidget(w) { calls.setWidget++; widget = w; }, complete() {} },
    };
    return { ctx, texts, calls, files, get widget() { return widget; } };
  }
  async function runWidget(opts) {
    const f = fakeScriptable(opts);
    vm.createContext(f.ctx);
    await vm.runInContext("(async () => {\n" + fs.readFileSync(WIDGET_PATH, "utf8") + "\n})()", f.ctx);
    return f;
  }

  await testAsync("small widget: tomorrow's breakfast and lunch", async () => {
    const f = await runWidget({ now: new Date(2026, 10, 10, 15), param: "", family: "small" });
    const t = f.texts.map(x => x.text);
    assert.equal(f.calls.setWidget, 1);
    assert.deepEqual(t, ["TOMORROW · WED", "BREAKFAST", "Honey Bun", "LUNCH", "Chicken Strips"]);
    assert.equal(f.widget.url, "https://hawkslunch.netlify.app/");
    assert.ok(f.files.has("/docs/hellgate-lunch/menu.json"), "menu saved for offline use");
  });

  await testAsync("medium widget with all meals shows sides", async () => {
    const f = await runWidget({ now: new Date(2026, 10, 10, 7), param: "all", family: "medium" });
    const t = f.texts.map(x => x.text);
    assert.deepEqual(t.slice(0, 4), ["TODAY · TUE", "BREAKFAST", "Yogurt Bar; Add Your Own Toppings!", "Mini Donuts · Mixed Berries"]);
    assert.ok(t.includes("BREAK · MS") && t.includes("Mini Pancakes") && t.includes("Yogurt · Fruits · Milk"));
    assert.ok(t.includes("Cheeseburger") && t.includes("Oven Fries · Strawberries"));
  });

  await testAsync("offline: uses the saved menu; with none, says so", async () => {
    const files = new Map([["/docs/hellgate-lunch/menu.json", JSON.stringify(menu)], ["/docs/hellgate-lunch/2026-11-02.png", "old"]]);
    let f = await runWidget({ now: new Date(2026, 10, 12, 8), param: "lunch", family: "small", online: false, files });
    assert.deepEqual(f.texts.map(x => x.text), ["TODAY · THU", "LUNCH", "Corn Dog"]);
    f = await runWidget({ now: new Date(2026, 10, 12, 8), param: "", family: "small", online: false });
    assert.ok(f.texts.some(x => /Can't reach the menu/.test(x.text)));
  });

  await testAsync("old widget's day pictures are cleaned up", async () => {
    const files = new Map([["/docs/hellgate-lunch/2026-11-02.png", "old"], ["/docs/hellgate-lunch/state.json", "{}"]]);
    await runWidget({ now: new Date(2026, 10, 12, 8), param: "", family: "small", files });
    assert.ok(!files.has("/docs/hellgate-lunch/2026-11-02.png") && !files.has("/docs/hellgate-lunch/state.json"));
  });

  await testAsync("December not posted yet", async () => {
    const f = await runWidget({ now: new Date(2026, 10, 30, 15), param: "", family: "small" });
    assert.deepEqual(f.texts.map(x => x.text), ["NEXT SCHOOL DAY", "December menu not posted yet"]);
  });

  await testAsync("run in the Scriptable app: shows a preview", async () => {
    const f = await runWidget({ now: new Date(2026, 10, 10, 7), param: "", family: undefined, inWidget: false });
    assert.equal(f.calls.present, 1);
    assert.equal(f.calls.setWidget, 0);
  });
}

{
  console.log("\nSecurity: only school files in, only plain menu data out");
  const { checkMenu, schoolUrl, plainText } = await import("../menu/check.mjs");
  const { schoolHost } = await import("../menu/build.mjs");
  const { makeIcs } = await import("../menu/calendar.mjs");
  const real = JSON.parse(fs.readFileSync(path.join(FIXTURES, "menu-2026-11.json"), "utf8"));
  const copy = () => JSON.parse(JSON.stringify(real));

  test("the real November menu passes the safety check", () => {
    assert.deepEqual(checkMenu(real), []);
  });

  test("the build only fetches https files from the school's hosts", () => {
    assert.ok(schoolHost("https://resources.finalsite.net/images/v1/hellgatek12mtus/x/NovemberLUNCH2026.pdf"));
    assert.ok(schoolHost("https://www.hellgate.k12.mt.us/departments/food-services"));
    for (const u of ["http://resources.finalsite.net/x.pdf", "https://evil.example/NovemberLUNCH2026.pdf",
      "https://resources.finalsite.net.evil.example/x.pdf", "https://user@resources.finalsite.net/x.pdf",
      "https://resources.finalsite.net:8443/x.pdf", "file:///etc/passwd", "javascript:alert(1)", "not a url"]) {
      assert.ok(!schoolHost(u), u);
      assert.ok(!schoolUrl(u), u);
    }
  });

  test("markup, scripts and odd fields in the menu are refused", () => {
    const cases = [
      m => { m.days["2026-11-10"].items[0] = '<img src=x onerror=alert(1)>'; },
      m => { m.days["2026-11-10"].items[0] = "Pizza\r\nBEGIN:VEVENT"; },
      m => { m.days["2026-11-10"].items = "Pizza"; },
      m => { m.days["2026-11-10"].evil = 1; },
      m => { m.days["2026-11-10"] = { img: "../../index.html", w: 10, h: 10, mask: true }; },
      m => { m.days["2026-11-10"] = { img: "cells/2026-11-10.png", w: "10;background:url(//evil)", h: 10, mask: true }; },
      m => { m.months["2026-11"].source = "javascript:alert(1)"; },
      m => { m.months["2026-11"].source = "https://evil.example/menu.pdf"; },
      m => { m.page = "https://evil.example/"; },
      m => { m.extra = true; },
      m => { m.typed["2026-11-10"] = ["x".repeat(500)]; },
    ];
    cases.forEach((f, i) => { const m = copy(); f(m); assert.ok(checkMenu(m).length > 0, "case " + i + " was accepted"); });
    assert.ok(plainText("Sweet & Sour Chicken/Rice"));
    assert.ok(plainText("Yogurt Bar; Add Your Own Toppings!"));
  });

  test("calendar text can't break out of its event", () => {
    const m = { typed: { "2026-11-10": ["Pizza\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Fake", "Milk;x,y\\z"] }, days: {}, months: {} };
    const ics = makeIcs(m, "https://hellgatelunch.github.io/").replace(/\r\n /g, ""); // unfolded
    assert.equal((ics.match(/^BEGIN:VEVENT/gm) || []).length, 1);
    assert.ok(!/^SUMMARY:Fake/m.test(ics));
    assert.ok(ics.includes("Milk\\;x\\,y\\\\z"));
  });

  test("the app ignores ?now= and ?pictures on the real site", () => {
    const app = fs.readFileSync(path.join(path.dirname(FIXTURES), "..", "web", "app.js"), "utf8");
    assert.match(app, /var LOCAL = \/\^\(localhost\|127/);
    assert.ok(!/URLSearchParams\(location\.search\)\.(get|has)\("(now|pictures)"\)/.test(app));
  });

  test("every page has a Content-Security-Policy and no inline scripts", () => {
    const web = path.join(path.dirname(FIXTURES), "..", "web");
    for (const f of ["index.html", "flyer.html", "google/index.html"]) {
      const html = fs.readFileSync(path.join(web, f), "utf8");
      assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/, f);
      assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), f + " has an inline script");
      assert.ok(!/\son[a-z]+\s*=/.test(html), f + " has an inline event handler");
    }
  });
}

{
  console.log("\nSecurity: shared rules, hand-off, pictures");
  const schema = await import("../menu/schema.mjs");
  const { accept } = await import("../menu/accept.mjs");
  const { checkMenu } = await import("../menu/check.mjs");
  const { PNG } = await import("pngjs");
  const os = await import("node:os");
  const WEB = path.join(path.dirname(FIXTURES), "..", "web");
  const real = JSON.parse(fs.readFileSync(path.join(FIXTURES, "menu-2026-11.json"), "utf8"));
  const copy = () => JSON.parse(JSON.stringify(real));

  test("invisible, direction-changing and un-normalized text is refused, and the build strips it", () => {
    for (const s of ["Pizza‮", "Pi​zza", "﻿Pizza", "Pizza⁦x⁩", "Café", "Soft­taco"]) {
      assert.ok(!schema.plainText(s), JSON.stringify(s));
      assert.ok(schema.plainText(schema.cleanText(s)), "cleaned " + JSON.stringify(s));
    }
    const m = copy(); m.days["2026-11-10"].items[0] = "Cheese​burger";
    assert.ok(checkMenu(m).length > 0);
  });

  test("dates must be real days", () => {
    assert.ok(schema.isDate("2026-11-10") && schema.isDate("2028-02-29"));
    for (const d of ["2026-02-30", "2026-13-01", "2026-00-10", "2027-02-29", "26-11-10", "2026-11-10T00"]) assert.ok(!schema.isDate(d), d);
    const m = copy(); m.days["2026-02-30"] = { items: ["Pizza"] };
    assert.ok(checkMenu(m).length > 0);
  });

  test("JSON with __proto__ / constructor keys is refused", () => {
    for (const t of ['{"__proto__":{"x":1}}', '{"a":{"constructor":{"prototype":{}}}}']) assert.throws(() => schema.safeParse(t));
    assert.deepEqual(schema.safeParse('{"a":[1,"b"]}'), { a: [1, "b"] });
  });

  test("day pictures must be plain PNGs (no animation, profiles, text or bad CRCs)", () => {
    const good = PNG.sync.write(new PNG({ width: 6, height: 4 }));
    assert.equal(schema.pngProblem(good), null);
    // Insert a chunk right after IHDR (8 + 25 bytes).
    const chunk = (type, data) => {
      const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
      const body = Buffer.concat([head.subarray(4), data]);
      let c = 0xffffffff; for (const b of body) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
      const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
      return Buffer.concat([head, data, crc]);
    };
    const withChunk = (type, data) => Buffer.concat([good.subarray(0, 33), chunk(type, data), good.subarray(33)]);
    assert.match(schema.pngProblem(withChunk("acTL", Buffer.alloc(8))), /acTL/);
    assert.match(schema.pngProblem(withChunk("iCCP", Buffer.from("x\0\0abc"))), /iCCP/);
    assert.match(schema.pngProblem(withChunk("tEXt", Buffer.from("k\0v"))), /tEXt/);
    const crc = Buffer.from(good); crc[30] ^= 1;
    assert.match(schema.pngProblem(crc), /CRC/);
    assert.ok(schema.pngProblem(Buffer.concat([good, Buffer.from("<script>")])));
    assert.ok(schema.pngProblem(Buffer.from("<svg onload=alert(1)>")));
  });

  test("the web app's picture rule is the same as the shared one", () => {
    const app = fs.readFileSync(path.join(WEB, "app.js"), "utf8");
    const m = app.match(/var PICTURE = (\/.+\/);/);
    assert.ok(m, "PICTURE not found in app.js");
    assert.equal(m[1], String(schema.PICTURE));
    assert.match(app, /\.then\(safeParse\)/);
  });

  // A hand-off folder like the build job uploads, from the repository's current data.
  const handoff = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "hl-handoff-"));
    fs.mkdirSync(path.join(d, "data", "cells"), { recursive: true });
    fs.mkdirSync(path.join(d, "data", "cells-breakfast"), { recursive: true });
    fs.copyFileSync(path.join(WEB, "data", "menu.json"), path.join(d, "data", "menu.json"));
    fs.copyFileSync(path.join(WEB, "calendar.ics"), path.join(d, "calendar.ics"));
    // The day pictures the menu points to, if any (a month the build couldn't read as text).
    for (const sub of ["cells", "cells-breakfast"]) {
      const src = path.join(WEB, "data", sub);
      if (fs.existsSync(src)) for (const f of fs.readdirSync(src)) if (/^\d{4}-\d\d-\d\d\.png$/.test(f)) fs.copyFileSync(path.join(src, f), path.join(d, "data", sub, f));
    }
    return d;
  };
  const site = () => {
    const w = fs.mkdtempSync(path.join(os.tmpdir(), "hl-web-"));
    fs.mkdirSync(path.join(w, "data", "cells"), { recursive: true });
    fs.writeFileSync(path.join(w, "data", "menu.json"), "OLD");
    return w;
  };

  test("a good hand-off is taken in", () => {
    const d = handoff(), w = site();
    assert.deepEqual(accept(d, w), []);
    assert.equal(fs.readFileSync(path.join(w, "data", "menu.json"), "utf8"), fs.readFileSync(path.join(WEB, "data", "menu.json"), "utf8"));
  });

  test("a bad hand-off is refused and nothing is written (the site keeps the old menu)", () => {
    const cases = {
      "extra page": d => fs.writeFileSync(path.join(d, "data", "evil.html"), "<script>"),
      "app code": d => fs.writeFileSync(path.join(d, "app.js"), "alert(1)"),
      "git folder": d => { fs.mkdirSync(path.join(d, ".git", "hooks"), { recursive: true }); fs.writeFileSync(path.join(d, ".git", "hooks", "post-commit"), "x"); },
      "odd picture name": d => fs.writeFileSync(path.join(d, "data", "cells", "x.png"), PNG.sync.write(new PNG({ width: 2, height: 2 }))),
      "not a PNG": d => fs.writeFileSync(path.join(d, "data", "cells", "2026-11-10.png"), "<svg/>"),
      "script in menu": d => { const p = path.join(d, "data", "menu.json"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("Cheeseburger", "<img src=x onerror=alert(1)>")); },
      "calendar edited": d => fs.appendFileSync(path.join(d, "calendar.ics"), "X-EVIL:1\r\n"),
      "menu missing": d => fs.rmSync(path.join(d, "data", "menu.json")),
      "prototype key": d => { const p = path.join(d, "data", "menu.json"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace('"page"', '"__proto__": {}, "page"')); },
    };
    for (const [name, spoil] of Object.entries(cases)) {
      const d = handoff(), w = site();
      spoil(d);
      assert.ok(accept(d, w).length > 0, name + " was accepted");
      assert.equal(fs.readFileSync(path.join(w, "data", "menu.json"), "utf8"), "OLD", name + " wrote something");
    }
    // A link (where this computer allows making one).
    const d = handoff(), w = site();
    let linked = false;
    try { fs.symlinkSync(path.join(WEB, "index.html"), path.join(d, "data", "cells", "2026-11-10.png")); linked = true; } catch (e) {}
    if (linked) assert.ok(accept(d, w).some(p => /link/.test(p)));
  });

  test("the publishing Action keeps no token on disk and never applies patches", () => {
    const yml = fs.readFileSync(path.join(WEB, "..", ".github", "workflows", "menu.yml"), "utf8");
    assert.equal((yml.match(/persist-credentials: false/g) || []).length, 2);
    assert.ok(!/git apply/.test(yml));
    assert.match(yml, /env -i PATH="\$PATH" HOME="\$HOME" node menu\/accept\.mjs/);
    assert.match(yml, /^permissions: \{\}$/m);
    for (const u of yml.match(/uses: \S+/g)) assert.match(u, /@[0-9a-f]{40}$/, u + " isn't pinned to a commit");
  });
}

{
  console.log("\nNetlify: scheduled refresh into Blobs, and serving it");
  const { runRefresh, serve, keyFor, SITE } = await import("../menu/site-store.mjs");
  const { pngProblem } = await import("../menu/schema.mjs");
  const { checkMenu } = await import("../menu/check.mjs");
  // A stand-in for a Netlify Blobs store.
  const fakeStore = () => {
    const m = new Map();
    return {
      m,
      async get(k, o = {}) { if (!m.has(k)) return null; const v = m.get(k); return o.type === "arrayBuffer" ? (typeof v === "string" ? Buffer.from(v) : v).buffer.slice(0) : (typeof v === "string" ? v : Buffer.from(v).toString("utf8")); },
      async set(k, v) { m.set(k, typeof v === "string" ? v : Buffer.from(v)); },
      async delete(k) { m.delete(k); },
      async list() { return { blobs: [...m.keys()].map(key => ({ key })) }; },
    };
  };
  const pageHtml = fs.readFileSync(path.join(FIXTURES, "k8-menu-page.html"), "utf8");
  const fx = n => fs.readFileSync(path.join(FIXTURES, n));
  const files = (withPdf) => async (meal, kind) => {
    const base = meal === "lunch" ? "november-2026" : "november-2026-breakfast";
    return kind === "render" ? fx(base + ".png") : withPdf ? fx(base + ".pdf") : Buffer.from("not a pdf");
  };
  const empty = { menu: null, ics: null, cells: new Map() };
  const now = new Date(2026, 10, 10, 9);
  const quiet = () => {};

  await testAsync("first run reads the menus into the store, with the Netlify address in the calendar", async () => {
    const store = fakeStore(); let purged = 0;
    const r = await runRefresh({ store, now, page: async () => pageHtml, file: files(true), seed: empty, purge: async () => { purged++; }, log: quiet });
    assert.ok(r.ok && r.changed, r.message);
    const menu = JSON.parse(store.m.get("menu.json"));
    assert.deepEqual(checkMenu(menu), []);
    assert.deepEqual(menu.days["2026-11-10"].items, ["Cheeseburger", "Oven Fries", "Strawberries"]);
    assert.match(store.m.get("calendar.ics"), /URL:https:\/\/hawkslunch\.netlify\.app\//);
    assert.equal(purged, 1);
    assert.equal(JSON.parse(store.m.get("status.json")).ok, true);
    // Same menus again: nothing changes, nothing is purged.
    const again = await runRefresh({ store, now, page: async () => pageHtml, file: files(true), seed: empty, purge: async () => { purged++; }, log: quiet });
    assert.ok(again.ok && !again.changed, again.message);
    assert.equal(purged, 1);
  });

  await testAsync("school site down: the saved menu stays, and the status says why", async () => {
    const store = fakeStore();
    await runRefresh({ store, now, page: async () => pageHtml, file: files(true), seed: empty, log: quiet });
    const before = store.m.get("menu.json");
    const r = await runRefresh({ store, now, page: async () => { throw new Error("timeout"); }, seed: empty, log: quiet });
    assert.equal(r.ok, false);
    assert.equal(store.m.get("menu.json"), before);
    assert.match(JSON.parse(store.m.get("status.json")).message, /Couldn't reach/);
  });

  await testAsync("without readable words, pictures are stored and served as PNGs", async () => {
    const store = fakeStore();
    const r = await runRefresh({ store, now, page: async () => pageHtml, file: files(false), seed: empty, log: quiet });
    assert.ok(r.ok, r.message);
    const menu = JSON.parse(store.m.get("menu.json"));
    const img = menu.days["2026-11-10"].img;
    assert.equal(img, "cells/2026-11-10.png");
    const s = await serve({ store, pathname: "/data/" + img });
    assert.equal(s.status, 200);
    assert.equal(s.type, "image/png");
    assert.equal(pngProblem(s.body), null);
  });

  await testAsync("serving: only the menu paths; the bundled copy until the first run", async () => {
    const store = fakeStore();
    for (const p of ["/data/menu.json/../../package.json", "/package.json", "/data/cells/evil.png", "/data/x.json", "/netlify.toml", "/data/cells/2026-11-10.png.html"]) {
      assert.equal(keyFor(p), null, p);
      assert.equal((await serve({ store, pathname: p })).status, 404, p);
    }
    const seed = { menu: '{"seed":1}', ics: "BEGIN:VCALENDAR", cells: new Map() };
    const m = await serve({ store, pathname: "/data/menu.json", seed });
    assert.equal(m.body, '{"seed":1}');
    assert.equal(m.type, "application/json; charset=utf-8");
    assert.equal((await serve({ store, pathname: "/calendar.ics", seed })).type, "text/calendar; charset=utf-8");
    assert.equal(SITE, "https://hawkslunch.netlify.app/");
  });
}

{
  console.log("\nEvening reminder (7:30 PM, with tomorrow's lunch)");
  const R = await import("../menu/reminder.mjs");
  const { VAPID_PUBLIC_KEY } = await import("../menu/vapid-public.mjs");
  const menu = JSON.parse(fs.readFileSync(path.join(FIXTURES, "menu-2026-11.json"), "utf8"));
  const memStore = () => {
    const m = new Map();
    return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async set(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, async list() { return { blobs: [...m.keys()].map(key => ({ key })) }; } };
  };
  const goodSub = (n = 1) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") }, expirationTime: null });

  test("only real notification services and well-formed keys are accepted", () => {
    assert.ok(R.cleanSubscription(goodSub()));
    assert.ok(R.cleanSubscription({ ...goodSub(), endpoint: "https://web.push.apple.com/QGx" }));
    assert.ok(R.cleanSubscription({ ...goodSub(), endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x" }));
    const bad = [
      { ...goodSub(), endpoint: "http://fcm.googleapis.com/fcm/send/x" },
      { ...goodSub(), endpoint: "https://evil.example/push" },
      { ...goodSub(), endpoint: "https://fcm.googleapis.com.evil.example/x" },
      { ...goodSub(), endpoint: "https://user@fcm.googleapis.com/x" },
      { ...goodSub(), keys: { p256dh: "short", auth: goodSub().keys.auth } },
      { ...goodSub(), keys: { p256dh: goodSub().keys.p256dh, auth: "<script>" } },
      { endpoint: goodSub().endpoint }, null, "x", [],
    ];
    bad.forEach((s, i) => assert.equal(R.cleanSubscription(s), null, "case " + i));
    // Nothing but the address is kept.
    assert.deepEqual(Object.keys(R.cleanSubscription({ ...goodSub(), name: "Ashley", email: "a@b.c" })).sort(), ["endpoint", "keys"]);
  });

  await testAsync("turning it on stores only the address; turning it off deletes it", async () => {
    const store = memStore();
    const welcomed = [];
    let r = await R.handleSignup({ store, method: "POST", body: { subscription: goodSub() }, now: new Date(2026, 10, 19), welcome: async s => { welcomed.push(s.endpoint); } });
    assert.equal(r.status, 200);
    assert.deepEqual(welcomed, [goodSub().endpoint]);
    // A failed welcome doesn't undo the sign-up.
    r = await R.handleSignup({ store: memStore(), method: "POST", body: { subscription: goodSub(9) }, welcome: async () => { throw new Error("push down"); } });
    assert.equal(r.status, 200);
    const saved = JSON.parse(store.m.get(R.keyFor(goodSub().endpoint)));
    assert.deepEqual(Object.keys(saved).sort(), ["endpoint", "keys", "since"]);
    assert.equal((await R.handleSignup({ store, method: "POST", body: { subscription: { endpoint: "https://evil.example/" } } })).status, 400);
    assert.equal((await R.handleSignup({ store, method: "GET", body: {} })).status, 405);
    r = await R.handleSignup({ store, method: "DELETE", body: { endpoint: goodSub().endpoint } });
    assert.equal(r.status, 200);
    assert.equal(store.m.size, 0);
  });

  test("tomorrow's reminder: lunch in the title, breakfast below; nothing before days off", () => {
    const thu = R.reminderFor(menu, "2026-11-19");
    assert.equal(thu.title, "Tomorrow: Turkey/Cheddar Wrap");
    assert.equal(thu.body, "Breakfast: Cereal · Tap to pick School or Home");
    assert.equal(R.reminderFor(menu, "2026-11-20"), null, "Friday night: Saturday");
    assert.equal(R.reminderFor(menu, "2026-11-21"), null, "Saturday night: Sunday");
    assert.equal(R.reminderFor(menu, "2026-11-24"), null, "before Thanksgiving break");
    assert.equal(R.reminderFor(menu, "2026-11-22").title, "Tomorrow: Grilled Cheese");
    assert.equal(R.reminderFor(menu, "2026-11-30"), null, "December not posted");
  });

  test("7:30 PM in Montana all year (two UTC runs, one sends)", () => {
    assert.deepEqual(R.schoolClock(new Date("2026-11-20T02:30:00Z")), { date: "2026-11-19", hour: 19, minute: 30 });
    assert.equal(R.schoolClock(new Date("2026-11-20T01:30:00Z")).hour, 18);
    assert.equal(R.schoolClock(new Date("2027-05-14T01:30:00Z")).hour, 19, "daylight saving");
    assert.equal(R.schoolClock(new Date("2027-05-14T02:30:00Z")).hour, 20);
  });

  await testAsync("the nightly run sends to everyone and forgets phones that turned it off", async () => {
    const store = memStore();
    for (const n of [1, 2, 3]) await R.handleSignup({ store, method: "POST", body: { subscription: goodSub(n) } });
    const sent = [];
    const send = async (sub, payload) => { if (sub.endpoint.endsWith("abc2")) throw Object.assign(new Error("gone"), { statusCode: 410 }); sent.push([sub.endpoint, JSON.parse(payload)]); };
    const quiet = () => {};
    const early = await R.runReminders({ store, menu, send, now: new Date("2026-11-20T01:30:00Z"), log: quiet });
    assert.equal(early.sent, 0);
    const r = await R.runReminders({ store, menu, send, now: new Date("2026-11-20T02:30:00Z"), log: quiet });
    assert.equal(r.sent, 2);
    assert.equal(r.removed, 1);
    assert.equal(store.m.size, 2);
    assert.equal(sent[0][1].title, "Tomorrow: Turkey/Cheddar Wrap");
    const fri = await R.runReminders({ store, menu, send, now: new Date("2026-11-21T02:30:00Z"), log: quiet });
    assert.equal(fri.sent, 0, "no reminder Friday night");
  });

  test("the app and the sender use the same public key; no private key in the code", () => {
    const app = fs.readFileSync(path.join(path.dirname(FIXTURES), "..", "web", "app.js"), "utf8");
    assert.ok(app.includes(`var VAPID_PUBLIC_KEY = "${VAPID_PUBLIC_KEY}";`));
    for (const f of ["web/app.js", "menu/reminder.mjs", "menu/vapid-public.mjs", "netlify/functions/send-reminders.mjs", "netlify.toml"]) {
      assert.ok(!/privateKey|VAPID_PRIVATE_KEY\s*=\s*["'][A-Za-z0-9_-]{20,}/.test(fs.readFileSync(path.join(path.dirname(FIXTURES), "..", f), "utf8")), f);
    }
  });
}

console.log(failed ? `\n${failed} failed` : "\nAll passed. Day crops are in test/out/.");
process.exit(failed ? 1 : 0);
