// Takes the menu data the build job handed over (a folder laid out like web/: data/menu.json,
// calendar.ics, data/cells*/<date>.png) and, only if every file is allowed and passes the
// checks, copies it into this repository's web/ folder. Nothing is written unless everything
// passes, so a bad hand-off leaves the site on the previous menu.
//
//   node menu/accept.mjs <folder>
// Node built-ins only; run in the publishing job before anything else is installed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_FILE } from "./schema.mjs";
import { checkWeb } from "./check.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every entry in the hand-off: plain files and folders only, each file on the allowed list.
export function listHandoff(dir) {
  const files = [], bad = [];
  const walk = rel => {
    for (const name of fs.readdirSync(path.join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name, st = fs.lstatSync(path.join(dir, r));
      if (st.isSymbolicLink()) bad.push(`link not allowed: ${r}`);
      else if (st.isDirectory()) { if (/^(data|data\/cells|data\/cells-breakfast)$/.test(r)) walk(r); else bad.push(`folder not allowed: ${r}`); }
      else if (!st.isFile()) bad.push(`not a plain file: ${r}`);
      else if (!DATA_FILE.test(r)) bad.push(`file not allowed: ${r}`);
      else files.push(r);
    }
  };
  walk("");
  for (const need of ["data/menu.json", "calendar.ics"]) if (!files.includes(need)) bad.push(`missing ${need}`);
  return { files, bad };
}

// Checks the hand-off, then replaces web/'s menu data with it. Returns the problems (empty = done).
export function accept(dir, webDir = path.join(ROOT, "web")) {
  const { files, bad } = listHandoff(dir);
  if (bad.length) return bad;
  const problems = checkWeb(dir);
  if (problems.length) return problems;
  // All good: day pictures are replaced as a set, so ones the build dropped go too.
  for (const sub of ["cells", "cells-breakfast"]) {
    const d = path.join(webDir, "data", sub);
    fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(d)) if (/^\d{4}-\d\d-\d\d\.png$/.test(f)) fs.rmSync(path.join(d, f));
  }
  for (const r of files) fs.copyFileSync(path.join(dir, r), path.join(webDir, r));
  return [];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.log("usage: node menu/accept.mjs <folder>"); process.exit(2); }
  const bad = accept(path.resolve(dir));
  if (bad.length) { console.log("::error::The menu hand-off was refused; the site keeps the previous menu:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log("Menu hand-off accepted.");
}
