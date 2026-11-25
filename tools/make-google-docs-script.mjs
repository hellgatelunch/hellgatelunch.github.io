// Writes the Google Docs menu script with today's food lists (tools/foods.json) filled in:
//   node tools/make-google-docs-script.mjs
// → menu-calendars/Hawks Lunch menu (Google Docs script).js, to paste into script.google.com.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const foods = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "foods.json"), "utf8"));
delete foods.about;
const tpl = fs.readFileSync(path.join(ROOT, "tools", "google-docs-menu.template.js"), "utf8");
if (!tpl.includes("/*FOODS*/")) throw new Error("template is missing /*FOODS*/");
const out = path.join(ROOT, "menu-calendars", "Hawks Lunch menu (Google Docs script).js");
fs.writeFileSync(out, tpl.replace("/*FOODS*/", JSON.stringify(foods, null, 1)));
console.log("Wrote " + path.relative(ROOT, out));
