// Draws the app icons (a plate on orange) as PNGs into web/icons/. Run: node tools/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "icons");
fs.mkdirSync(DIR, { recursive: true });

const ORANGE = [201, 84, 26], WHITE = [255, 255, 255], RIM = [246, 226, 212];

function icon(size, file) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2, S = 4; // 4x4 supersampling for smooth edges
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S, r = Math.hypot(px - c, py - c) / size;
      let col = ORANGE;
      if (r < 0.36) col = WHITE;          // plate
      if (r < 0.36 && r > 0.33) col = RIM; // rim line
      if (r < 0.24 && r > 0.225) col = RIM; // inner well
      acc = acc.map((v, i) => v + col[i]);
    }
    const i = (y * size + x) * 4;
    png.data[i] = acc[0] / (S * S); png.data[i + 1] = acc[1] / (S * S); png.data[i + 2] = acc[2] / (S * S); png.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(DIR, file), PNG.sync.write(png));
}

icon(180, "apple-touch-icon.png");
icon(192, "icon-192.png");
icon(512, "icon-512.png");
console.log("Wrote icons to web/icons/");
