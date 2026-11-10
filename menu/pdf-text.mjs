// Reads the words in each day's box straight from the school's PDF (its text layer), so the
// app can show real text in its own style instead of pictures of the menu.
//
// The day boxes come from the picture (gridFind/boxFor on the PNG of page 1); pdf.js gives each
// text run's position on the same page, scaled to the PNG's width, so each run lands in its box.

// Lines of text in each box: { "2026-11-02": ["2", "Sweet & Sour Chicken/Rice", ...], ... }.
// Returns null if the PDF can't be read or has no text layer.
export async function linesInBoxes(pdfBytes, pngWidth, boxes) {
  let pdfjs;
  try { pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); } catch (e) { return null; }
  let page;
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableFontFace: true, verbosity: 0 }).promise;
    page = await doc.getPage(1);
  } catch (e) { return null; }
  const vp = page.getViewport({ scale: pngWidth / page.getViewport({ scale: 1 }).width });
  const { items } = await page.getTextContent();

  const runs = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [x, baseline] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = Math.max(1, it.height * vp.scale);
    runs.push({ str: it.str, x, right: x + it.width * vp.scale, baseline, h });
  }
  if (!runs.length) return null;

  const out = {};
  for (const [k, b] of Object.entries(boxes)) {
    // A run belongs to the box that holds the middle of its first letter.
    const inBox = runs.filter(r => {
      const cx = r.x + 2, cy = r.baseline - r.h * 0.35;
      return cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
    }).sort((p, q) => p.baseline - q.baseline || p.x - q.x);
    const lines = [];
    let cur = null;
    for (const r of inBox) {
      if (cur && Math.abs(r.baseline - cur.baseline) < r.h * 0.5) {
        cur.text += (r.x - cur.right > 1 ? " " : "") + r.str;
        cur.right = r.right;
      } else {
        cur = { baseline: r.baseline, right: r.right, text: r.str };
        lines.push(cur);
      }
    }
    out[k] = lines.map(l => l.text.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  return out;
}

// Turns a box's lines into what the app shows:
//   { items: ["Main", "side", ...] } | { off: "No school" } | null (nothing written).
export function toMeal(lines) {
  let ls = (lines || []).filter(l => /[A-Za-z0-9]/.test(l)); // drops stray marks like "`"
  if (ls.length && /^\d{1,2}$/.test(ls[0])) ls = ls.slice(1);  // the date number
  ls = ls.filter(l => !/^\d{1,2}$/.test(l));
  // A line ending in ";" "," "&" "-" or "/" (or followed by a lowercase line) continues on the next.
  const joined = [];
  for (const l of ls) {
    const prev = joined[joined.length - 1];
    if (prev && (/[;,&\-/]$/.test(prev) || /^[a-z]/.test(l))) joined[joined.length - 1] = prev + " " + l;
    else joined.push(l);
  }
  if (!joined.length) return null;
  if (joined.every(l => /^no school\b/i.test(l))) return { off: "No school" };
  if (joined.length === 1 && /^(no school|school closed|holiday|winter break|spring break|thanksgiving break)\b/i.test(joined[0])) {
    return { off: joined[0].charAt(0).toUpperCase() + joined[0].slice(1).toLowerCase() };
  }
  return { items: joined };
}
