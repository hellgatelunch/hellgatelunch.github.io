// Serves the menu data the refresh saved in Netlify Blobs: /data/menu.json, /calendar.ics,
// /data/status.json and the day pictures. Nothing else (menu/site-store.mjs keyFor).
// Netlify's CDN keeps a copy for 15 minutes; a menu update clears it right away.
import { getStore } from "@netlify/blobs";
import { serve } from "../../menu/site-store.mjs";

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Access-Control-Allow-Origin": "*",
};

export default async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", ...SECURITY } });
  const r = await serve({ store: getStore("menu"), pathname: new URL(req.url).pathname });
  return new Response(req.method === "HEAD" ? null : r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.type,
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": r.status === 200 ? "public, durable, s-maxage=900, stale-while-revalidate=86400" : "no-store",
      "Cache-Tag": "menu-data",
      ...SECURITY,
    },
  });
};

export const config = {
  path: ["/data/menu.json", "/data/status.json", "/calendar.ics", "/data/cells/*", "/data/cells-breakfast/*"],
};
