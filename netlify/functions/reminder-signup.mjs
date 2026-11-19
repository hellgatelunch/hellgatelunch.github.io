// /api/reminder: turns the 7:30 PM reminder on (POST the phone's push subscription) or off
// (DELETE with its endpoint). Same-site requests only; strict checks in menu/reminder.mjs.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { handleSignup, WELCOME } from "../../menu/reminder.mjs";
import { VAPID_PUBLIC_KEY } from "../../menu/vapid-public.mjs";

const SITE_ORIGIN = "https://hawkslunch.netlify.app";
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
const reply = (status, message) => new Response(JSON.stringify({ message }), { status, headers: HEADERS });

export default async (req) => {
  if (req.method !== "POST" && req.method !== "DELETE") return reply(405, "Method not allowed.");
  if (req.headers.get("origin") !== SITE_ORIGIN) return reply(403, "Not allowed.");
  if (!/^application\/json\b/.test(req.headers.get("content-type") || "")) return reply(415, "Send JSON.");
  const text = await req.text();
  if (text.length > 4096) return reply(413, "Too big.");
  let body;
  try { body = JSON.parse(text); } catch (e) { return reply(400, "Bad JSON."); }
  // A "reminder is on" notification to just this phone, so parents (and we) can see it works.
  const priv = process.env.VAPID_PRIVATE_KEY;
  const welcome = priv ? sub => {
    webpush.setVapidDetails("https://hawkslunch.netlify.app/", VAPID_PUBLIC_KEY, priv);
    return webpush.sendNotification(sub, JSON.stringify(WELCOME), { TTL: 600, urgency: "normal" });
  } : null;
  const r = await handleSignup({ store: getStore({ name: "reminders", consistency: "strong" }), method: req.method, body, welcome });
  return reply(r.status, r.message);
};

export const config = { path: "/api/reminder" };
