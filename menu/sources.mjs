// Sorts the files on the school's menu page into the menus the website shows.
// Uses the widget script's own link-finding code (extractLinks, describe, monthOf).
import { loadSection } from "../lib/script-parts.mjs";

export const S = loadSection("// ---------- reading the school's page", "// ---------- finding the calendar grid",
  ["extractLinks", "isLunch", "monthOf", "describe", "PAGE_URL", "MENU", "ACCEPT", "monthKey", "MON_LONG"]);

// The middle school "Breakfast @ Break" sheet (one file for the whole year), e.g.
// "BreakfastBreakMiddleSchool2026.pdf".
export function isBreakSheet(l) {
  const hay = S.describe(l);
  return /breakfast\s*@?\s*break|breakfastbreak|middle\s*school.*break/.test(hay);
}
// The monthly breakfast calendar, e.g. "November2026BREAKFASTdocx.pdf".
export function isBreakfast(l, now = new Date()) {
  const hay = S.describe(l);
  return hay.includes("breakfast") && !hay.includes("lunch") && !isBreakSheet(l) && S.monthOf(hay, now) !== null;
}
export function isLunch(l) { return S.isLunch(l); }

// { lunch: [links], breakfast: [links], breakSheet: link | null }, each monthly link with {year, month, mk}.
export function sortLinks(links, now = new Date()) {
  const withMonth = l => { const ym = S.monthOf(S.describe(l), now); return { ...l, ...ym, mk: S.monthKey(ym.year, ym.month) }; };
  return {
    lunch: links.filter(isLunch).map(withMonth),
    breakfast: links.filter(l => isBreakfast(l, now)).map(withMonth),
    breakSheet: links.find(isBreakSheet) || null,
  };
}
