// Reads one month of the school's menu: each school day's words (from the PDF's text layer),
// or, for a box whose words can't be read, a transparent picture the app tints with its ink color.
import { PNG } from "pngjs";
import { loadCore, flatten } from "../lib/script-parts.mjs";
import { linesInBoxes, toMeal } from "./pdf-text.mjs";

const core = loadCore();
const pad2 = n => String(n).padStart(2, "0");

// A transparent PNG of a box: ink becomes opacity, paper becomes see-through.
export function maskPng(img, t) {
  const out = new PNG({ width: t.w, height: t.h });
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const s = ((t.y + y) * img.w + t.x + x) * 4, o = (y * t.w + x) * 4;
    const lum = 0.299 * img.data[s] + 0.587 * img.data[s + 1] + 0.114 * img.data[s + 2];
    out.data[o] = out.data[o + 1] = out.data[o + 2] = 0;
    out.data[o + 3] = Math.max(0, Math.min(255, Math.round((235 - lum) * 255 / 200)));
  }
  return PNG.sync.write(out);
}

// png: decoded PNG of page 1 ({ width, height, data }); pdfBytes: the original PDF or null.
// Returns null if the calendar grid can't be found, else
//   { days: { "YYYY-MM-DD": {items} | {off} | {picture: Buffer, w, h, note?} }, noLunch: [keys], fromText, fromPictures }
export async function readMonth(png, pdfBytes, year, month) {
  const img = flatten({ data: png.data, w: png.width, h: png.height });
  const g = core.gridFind(img.data, img.w, img.h);
  if (!g) return null;
  const boxes = {};
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const b = core.boxFor(g, year, month, d);
    if (b) boxes[`${year}-${pad2(month + 1)}-${pad2(d)}`] = b;
  }
  const text = pdfBytes ? await linesInBoxes(pdfBytes, img.w, boxes) : null;

  const days = {}, noLunch = [];
  let fromText = 0, fromPictures = 0;
  for (const [k, b] of Object.entries(boxes)) {
    const t = core.trimBox(img.data, img.w, b);
    if (!t) { noLunch.push(k); continue; } // nothing but the date written
    const meal = text && text[k] ? toMeal(text[k]) : null;
    if (meal) { days[k] = meal; fromText++; continue; }
    // Ink in the box but no readable words (e.g. a scanned menu): keep a picture of it.
    days[k] = { picture: maskPng(img, t), w: t.w, h: t.h, ...(t.h < t.w * 0.3 ? { note: true } : {}) };
    fromPictures++;
  }
  return { days, noLunch, fromText, fromPictures };
}
