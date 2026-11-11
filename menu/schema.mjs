// The one place that says what menu data may look like: which addresses the build may fetch,
// which files it may hand over, what a date and a picture name are, and what counts as plain
// menu text. Used by the build (menu/build.mjs), the checks before publishing (menu/check.mjs,
// menu/accept.mjs) and the tests. The web app (web/app.js) can't import this file, so it keeps
// a copy of PICTURE; a test fails if the two ever differ.
// Node built-ins only: this runs in the publishing job before any npm packages are installed.

// The school's site and its file host. https only; no user names, passwords or ports.
export const SCHOOL_HOST = /^(resources\.finalsite\.net|(www\.)?hellgate\.k12\.mt\.us)$/i;
export function schoolUrl(u) {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.username && !x.password && !x.port && SCHOOL_HOST.test(x.hostname) && x.href === u;
  } catch (e) { return false; }
}

// A day picture's path inside web/data, e.g. "cells/2026-11-10.png".
export const PICTURE = /^cells(-breakfast)?\/\d{4}-\d\d-\d\d\.png$/;
// Every file the build may hand to the publishing job, relative to web/data's parent (web/).
export const DATA_FILE = /^(data\/menu\.json|calendar\.ics|data\/cells(-breakfast)?\/\d{4}-\d\d-\d\d\.png)$/;

// A real calendar date "YYYY-MM-DD" (not 2026-02-30).
export function isDate(k) {
  if (typeof k !== "string" || !/^\d{4}-\d\d-\d\d$/.test(k)) return false;
  const [y, m, d] = k.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y < 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function isMonth(k) { return typeof k === "string" && /^\d{4}-\d\d$/.test(k) && isDate(k + "-01"); }

// Characters that never belong in a menu: control codes, markup brackets, and invisible or
// direction-changing characters that can make text display differently from what it says.
const INVISIBLE = "\\u00ad\\u034f\\u061c\\u115f\\u1160\\u17b4\\u17b5\\u180e\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u206f\\u2028\\u2029\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0";
const STRIP = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f" + INVISIBLE + "]", "g");
const FORBIDDEN = new RegExp("[<>\\u0000-\\u001f\\u007f-\\u009f" + INVISIBLE + "]");

// What the build does to every string it writes: NFC, invisible and control characters removed.
export function cleanText(s) { return String(s).normalize("NFC").replace(STRIP, ""); }

// What the checks accept: short, NFC, nothing forbidden.
export function plainText(s, max = 160) {
  return typeof s === "string" && s.length > 0 && s.length <= max && s === s.normalize("NFC") && !FORBIDDEN.test(s);
}

// JSON.parse that refuses keys which could change an object's prototype when merged.
export function safeParse(text) {
  return JSON.parse(text, (k, v) => {
    if (k === "__proto__" || k === "constructor" || k === "prototype") throw new Error(`refused key "${k}"`);
    return v;
  });
}

// A PNG the way the build writes them (pngjs): signature, then IHDR, optional PLTE/tRNS/gAMA,
// IDAT, IEND, each chunk's CRC correct, nothing after IEND, sensible size. Refuses animated PNGs
// (acTL/fcTL), embedded profiles and text (iCCP, tEXt, iTXt, zTXt, eXIf) and anything else.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "gAMA", "IDAT", "IEND"]);
export function pngProblem(buf, maxBytes = 2 * 1024 * 1024, maxSide = 5000) {
  if (!Buffer.isBuffer(buf)) return "not bytes";
  if (buf.length > maxBytes) return "too big";
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) return "not a PNG";
  let at = 8, first = true, sawData = false;
  while (at < buf.length) {
    if (at + 12 > buf.length) return "cut off";
    const len = buf.readUInt32BE(at), type = buf.toString("latin1", at + 4, at + 8);
    if (len > buf.length - at - 12) return "chunk runs past the end";
    if (!/^[A-Za-z]{4}$/.test(type) || !PNG_CHUNKS.has(type)) return `chunk ${JSON.stringify(type)} not allowed`;
    if (crc32(buf, at + 4, at + 8 + len) !== buf.readUInt32BE(at + 8 + len)) return `bad CRC in ${type}`;
    if (first) {
      if (type !== "IHDR" || len !== 13) return "IHDR must come first";
      const w = buf.readUInt32BE(at + 8), h = buf.readUInt32BE(at + 12);
      if (!w || !h || w > maxSide || h > maxSide) return "bad size";
      first = false;
    } else if (type === "IHDR") return "second IHDR";
    if (type === "IDAT") sawData = true;
    at += 12 + len;
    if (type === "IEND") return at === buf.length && sawData ? null : "data after IEND or no image data";
  }
  return "no IEND";
}
