// Draws the QR code for the site's address into web/qr.svg (used by the flyer).
// Run: node tools/make-qr.mjs [url]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const SITE = process.argv[2] || "https://l33-dot.github.io/hellgate-lunch/";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "qr.svg");

const svg = await QRCode.toString(SITE, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#1D2A24", light: "#FFFFFF" } });
fs.writeFileSync(OUT, svg);
console.log(`Wrote web/qr.svg for ${SITE}`);
