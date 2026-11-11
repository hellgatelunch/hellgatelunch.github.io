// Draws the app icons: the Hawks logo on Hawks green with a gold stripe along the bottom, like the
// header band. Needs web/img/hawks-logo.png (made by tools/make-logo.mjs).
// Run: node tools/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "web", "icons");
const logo = PNG.sync.read(fs.readFileSync(path.join(ROOT, "web", "img", "hawks-logo.png")));
fs.mkdirSync(DIR, { recursive: true });

const GREEN = [41, 97, 11], GOLD = [252, 213, 45];

// Logo color at a point (source pixels), bilinear, premultiplied alpha. Returns [r*a, g*a, b*a, a] with a in 0..1.
function sample(x, y) {
  const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), fx = x - 0.5 - x0, fy = y - 0.5 - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx, py = y0 + dy;
    if (px < 0 || py < 0 || px >= logo.width || py >= logo.height || !w) continue;
    const i = (py * logo.width + px) * 4, a = logo.data[i + 3] / 255;
    out[0] += logo.data[i] * a * w; out[1] += logo.data[i + 1] * a * w; out[2] += logo.data[i + 2] * a * w; out[3] += a * w;
  }
  return out;
}

function icon(size, file) {
  const png = new PNG({ width: size, height: size });
  const lw = size * 0.8, lh = lw * logo.height / logo.width;     // logo: 80% of the width
  const stripe = Math.max(2, Math.round(size * 0.045));           // gold stripe at the bottom
  const lx = (size - lw) / 2, ly = (size - stripe - lh) / 2;     // centered above the stripe
  const scale = logo.width / lw, S = 4;                           // 4x4 samples per pixel
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bg = y >= size - stripe ? GOLD : GREEN;
    let acc = [0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
      let c = bg;
      if (px >= lx && px < lx + lw && py >= ly && py < ly + lh) {
        const [r, g, b, a] = sample((px - lx) * scale, (py - ly) * scale);
        c = [r + bg[0] * (1 - a), g + bg[1] * (1 - a), b + bg[2] * (1 - a)];
      }
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
    }
    const i = (y * size + x) * 4;
    png.data[i] = Math.round(acc[0] / (S * S)); png.data[i + 1] = Math.round(acc[1] / (S * S)); png.data[i + 2] = Math.round(acc[2] / (S * S)); png.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(DIR, file), PNG.sync.write(png));
}

icon(32, "favicon-32.png");
icon(180, "apple-touch-icon.png");
icon(192, "icon-192.png");
icon(512, "icon-512.png");
console.log("Wrote icons to web/icons/");
