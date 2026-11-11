// Cuts the Hawks logo out of its green background for the header: crops to the logo and makes
// the Hawks-green background see-through (soft edges).
// Run: node tools/make-logo.mjs assets/hawks-logo-source.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const src = process.argv[2];
if (!src) { console.error("usage: node tools/make-logo.mjs <source.png>"); process.exit(1); }
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "img", "hawks-logo.png");

const img = PNG.sync.read(fs.readFileSync(src));
const BG = [41, 97, 11]; // Hawks green behind the logo
const dist = i => Math.hypot(img.data[i] - BG[0], img.data[i + 1] - BG[1], img.data[i + 2] - BG[2]);

// Background → transparent, with a soft ramp so anti-aliased edges don't keep a green fringe.
const NEAR = 22, FAR = 70;
let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
  const i = (y * img.width + x) * 4, d = dist(i);
  const a = d <= NEAR ? 0 : d >= FAR ? 1 : (d - NEAR) / (FAR - NEAR);
  if (a > 0 && a < 1) {
    // Un-mix the green from edge pixels: c = a*fg + (1-a)*bg  →  fg = (c - (1-a)*bg) / a
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, Math.round((img.data[i + c] - (1 - a) * BG[c]) / a)));
  }
  img.data[i + 3] = Math.round(a * 255);
  if (a > 0.5) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}

const pad = 2;
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(img.width - 1, maxX + pad); maxY = Math.min(img.height - 1, maxY + pad);
const w = maxX - minX + 1, h = maxY - minY + 1;
const out = new PNG({ width: w, height: h });
for (let y = 0; y < h; y++) img.data.copy(out.data, y * w * 4, ((minY + y) * img.width + minX) * 4, ((minY + y) * img.width + maxX + 1) * 4);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`Wrote web/img/hawks-logo.png (${w}x${h})`);
