// Loads code section by section out of plain scripts, so the build and the tests run exactly that code:
//   lib/school-menu.js  reading the school's website and cutting its menu grid (build + tests)
//   hellgate-lunch.js   the iPhone widget (tests, with Scriptable stubbed)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPT_PATH = path.join(here, "school-menu.js");
export const WIDGET_PATH = path.join(here, "..", "hellgate-lunch.js");
export const SCRIPT_SRC = fs.readFileSync(SCRIPT_PATH, "utf8");
export const FIXTURES = path.join(here, "..", "test", "fixtures");
export const OUT = path.join(here, "..", "test", "out");

const src = SCRIPT_SRC;

// The grid-finding code (gridFind, boxFor, trimBox, weekRow).
export function loadCore() {
  const m = src.match(/const CORE = String\.raw`([\s\S]*?)`;/);
  if (!m) throw new Error("CORE block not found in lib/school-menu.js");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[1] + "\n;this.api={gridFind,boxFor,trimBox,weekRow};", ctx);
  return ctx.api;
}

// A section of lib/school-menu.js between two "// ----------" markers, run after the file's
// head (constants and small helpers), so pure helpers (link finding, month parsing) can run here.
export function loadSection(startMarker, endMarker, names, extraGlobals = {}) {
  return loadFrom(src, "// ---------- reading the school's page", startMarker, endMarker, names, extraGlobals);
}

// Same for the iPhone widget script (its head ends at "// ---------- picking the day").
export function loadWidgetSection(startMarker, endMarker, names, extraGlobals = {}) {
  return loadFrom(fs.readFileSync(WIDGET_PATH, "utf8"), "// ---------- picking the day", startMarker, endMarker, names, extraGlobals);
}

function loadFrom(text, headEnd, startMarker, endMarker, names, extraGlobals) {
  const a = text.indexOf(startMarker), b = text.indexOf(endMarker, a + 1), h = text.indexOf(headEnd);
  if (a < 0 || b < 0 || h < 0) throw new Error("section not found: " + startMarker);
  const ctx = { console, ...extraGlobals };
  vm.createContext(ctx);
  vm.runInContext(text.slice(0, h) + text.slice(a, b) + `
;this.api={${names.join(",")}};`, ctx);
  return ctx.api;
}

export function readPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { data: png.data, w: png.width, h: png.height };
}

// Flatten transparency onto white before reading pixels.
export function flatten(img) {
  const d = Buffer.from(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * a + 255 * (1 - a));
    d[i + 3] = 255;
  }
  return { ...img, data: d };
}

export function writeCrop(img, b, file) {
  const out = new PNG({ width: b.w, height: b.h });
  for (let y = 0; y < b.h; y++) {
    const s = ((b.y + y) * img.w + b.x) * 4;
    img.data.copy(out.data, y * b.w * 4, s, s + b.w * 4);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(out));
}
