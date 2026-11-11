// Hellgate Lunch — Scriptable widget (small or medium)
// Shows the next school day's breakfast and lunch at Hellgate Elementary K-8 (Hawks).
// Tap it to open the full week at hellgatelunch.github.io.
//
// Which meals: long-press the widget › Edit Widget › Parameter. Leave it empty for
// breakfast and lunch, or type: lunch · breakfast · break · all · "breakfast, break"

const SITE = "https://hellgatelunch.github.io/";
const MENU_URL = SITE + "data/menu.json";
const SWITCH_HOUR = 14; // after 2 PM, show the next school day

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
// In the order they're served. Colors match the website (light, dark).
const MEALS = [
  { id: "breakfast", label: "BREAKFAST", color: ["#7A5E00", "#F2CC3D"] },
  { id: "break", label: "BREAK · MS", color: ["#2B5B86", "#8DB9E6"] },
  { id: "lunch", label: "LUNCH", color: ["#29610B", "#8DCB62"] },
];

const pad2 = n => String(n).padStart(2, "0");
const key = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekend = d => d.getDay() === 0 || d.getDay() === 6;
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// ---------- picking the day ----------

// The widget parameter, as the list of meal ids to show.
function parseMeals(param) {
  const p = String(param || "").toLowerCase();
  if (!p.trim()) return ["breakfast", "lunch"];
  if (/\ball\b/.test(p)) return ["breakfast", "break", "lunch"];
  const ids = MEALS.map(m => m.id).filter(id => new RegExp("\\b" + id + "\\b").test(p));
  return ids.length ? ids : ["breakfast", "lunch"];
}

// What the menu says for one meal on a day: {items}, {off}, {pic}, or null (not posted).
// Same rules as the website (web/app.js).
function monthly(meal, k) {
  if (!meal) return null;
  const day = (meal.days || {})[k];
  if (day) return day.items ? { items: day.items } : day.off ? { off: day.off } : { pic: day };
  if ((meal.noLunch || []).includes(k)) return { off: "Nothing listed" };
  return null;
}
const real = l => !!(l && (l.items || (l.pic && !l.pic.note)));
function schoolDay(menu, d) {
  return !weekend(d) && (real(mealFor(menu, "lunch", d)) || real(mealFor(menu, "breakfast", d)));
}
function mealFor(menu, id, d) {
  const k = key(d);
  if (id === "lunch") {
    if (has(menu.typed, k)) return menu.typed[k] ? { items: menu.typed[k] } : { off: "No school" };
    return monthly({ days: menu.days, noLunch: menu.noLunch }, k);
  }
  if (id === "breakfast") return monthly(menu.breakfast, k);
  const b = menu.break;
  if (!b || !b.menus || weekend(d) || !schoolDay(menu, d)) return null;
  const mm = b.menus.find(x => x.months.includes(d.getMonth() + 1));
  return mm ? { items: mm.days[d.getDay() - 1].concat(b.always || []) } : null;
}

function label(day, today) {
  const diff = Math.round((midnight(day) - midnight(today)) / 86400000);
  if (diff === 0) return "Today · " + DOW[day.getDay()];
  if (diff === 1) return "Tomorrow · " + DOW[day.getDay()];
  return `${DOW[day.getDay()]}, ${MON[day.getMonth()]} ${day.getDate()}`;
}

// Today until 2 PM, then the next school day. Skips days off; stops where the menu runs out.
function pick(menu, now) {
  let day = midnight(now);
  if (now.getHours() >= SWITCH_HOUR) day = addDays(day, 1);
  for (let i = 0; i < 21; i++, day = addDays(day, 1)) {
    if (weekend(day)) continue;
    if (!mealFor(menu, "lunch", day) && !mealFor(menu, "breakfast", day)) break;
    if (schoolDay(menu, day)) return { ok: true, day, label: label(day, now) };
  }
  return { ok: false, day, label: "Next school day" };
}

// One meal as text for the widget: { main, sides } or { note }.
function mealText(l, id, day) {
  if (!l) return { note: id === "break" ? "Not on the menu" : `${MON_LONG[day.getMonth()]} menu not posted` };
  if (l.off) return { note: l.off };
  if (l.pic) return { note: "See the menu" };
  return { main: l.items[0], sides: l.items.slice(1).join(" · ") };
}

// ---------- widget ----------

const fm = FileManager.local();
const DIR = fm.joinPath(fm.documentsDirectory(), "hellgate-lunch");
const CACHE = fm.joinPath(DIR, "menu.json");

// The website's menu, saved on the phone so the widget still works offline.
async function loadMenu() {
  if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
  try {
    const r = new Request(MENU_URL);
    r.timeoutInterval = 15;
    const menu = await r.loadJSON();
    if (!menu || typeof menu !== "object" || !menu.days) throw new Error("bad menu");
    fm.writeString(CACHE, JSON.stringify(menu));
    // Clean up the old widget's day pictures (it used to cut up the school's PDF itself).
    for (const f of fm.listContents(DIR)) if (/^\d{4}-\d{2}-\d{2}\.png$/.test(f) || f === "state.json") fm.remove(fm.joinPath(DIR, f));
    return menu;
  } catch (e) {
    try { return JSON.parse(fm.readString(CACHE)); } catch (e2) { return null; }
  }
}

const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bg: dyn("#FFFFFF", "#1C231B"),
  ink: dyn("#1E2A1C", "#EAF0E6"),
  muted: dyn("#56634F", "#A3AE9F"),
  band: dyn("#29610B", "#1F4A08"),
  gold: new Color("#FCD52D"),
};

function buildWidget(menu, now, meals, family) {
  const small = family !== "medium" && family !== "large";
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(0, 0, 0, 0);
  w.url = SITE;

  // Hawks-green band with the day, like the website's header.
  const p = menu ? pick(menu, now) : { ok: false, day: midnight(now), label: "Hellgate Lunch" };
  const band = w.addStack();
  band.backgroundColor = C.band;
  band.setPadding(7, 12, 6, 12);
  band.layoutHorizontally();
  const when = band.addText(p.label.toUpperCase());
  when.font = Font.heavySystemFont(11);
  when.textColor = C.gold;
  when.lineLimit = 1;
  when.minimumScaleFactor = 0.8;
  band.addSpacer();

  const body = w.addStack();
  body.layoutVertically();
  body.setPadding(8, 12, 10, 12);

  if (!menu) {
    const t = body.addText("Can't reach the menu. Check your connection.");
    t.font = Font.semiboldSystemFont(13); t.textColor = C.muted;
  } else if (!p.ok) {
    const t = body.addText(`${MON_LONG[p.day.getMonth()]} menu not posted yet`);
    t.font = Font.boldSystemFont(15); t.textColor = C.ink; t.lineLimit = 3;
  } else {
    const shown = MEALS.filter(m => meals.includes(m.id));
    const tight = small && shown.length > 2;
    shown.forEach((m, i) => {
      if (i) body.addSpacer(tight ? 4 : 6);
      const tx = mealText(mealFor(menu, m.id, p.day), m.id, p.day);
      const lab = body.addText(m.label);
      lab.font = Font.heavySystemFont(9);
      lab.textColor = dyn(m.color[0], m.color[1]);
      if (tx.note) {
        const n = body.addText(tx.note);
        n.font = Font.semiboldSystemFont(12); n.textColor = C.muted; n.lineLimit = 1;
        return;
      }
      const main = body.addText(tx.main);
      main.font = Font.boldSystemFont(tight ? 12 : small ? 14 : 15);
      main.textColor = C.ink;
      main.lineLimit = tight ? 1 : 2;
      main.minimumScaleFactor = 0.75;
      if (!small && tx.sides) {
        const s = body.addText(tx.sides);
        s.font = Font.systemFont(11); s.textColor = C.muted; s.lineLimit = 1; s.minimumScaleFactor = 0.85;
      }
    });
  }
  body.addSpacer();

  // Redraw at 2 PM and just after midnight, and at least every 3 hours (to pick up new menus).
  const next = new Date(now);
  if (now.getHours() < SWITCH_HOUR) next.setHours(SWITCH_HOUR, 0, 5, 0);
  else { next.setDate(next.getDate() + 1); next.setHours(0, 1, 0, 0); }
  w.refreshAfterDate = new Date(Math.min(next.getTime(), now.getTime() + 3 * 3600 * 1000));
  return w;
}

// ---------- run ----------
const menu = await loadMenu();
const meals = parseMeals(args.widgetParameter);
if (config.runsInWidget) {
  Script.setWidget(buildWidget(menu, new Date(), meals, config.widgetFamily));
} else {
  // Run from the Scriptable app: show a preview of the widget.
  await buildWidget(menu, new Date(), meals, "medium").presentMedium();
}
Script.complete();
