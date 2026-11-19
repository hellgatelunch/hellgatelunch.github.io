// The project's root folder, wherever the code runs: here in the repository, or inside a Netlify
// function (where the code is bundled into one file and the data files sit at the function's
// root, LAMBDA_TASK_ROOT, because netlify.toml lists them in included_files).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.join(here, ".."), process.env.LAMBDA_TASK_ROOT, process.cwd(), here].filter(Boolean);
export const ROOT = candidates.find(d => fs.existsSync(path.join(d, "lib", "school-menu.js"))) || candidates[0];
