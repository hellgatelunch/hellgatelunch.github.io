// The 7:30 PM evening reminder: who signed up (Netlify Blobs store "reminders"), what tomorrow's
// reminder says, and sending it. Stores and the sender are passed in, so the tests use stand-ins.
//
// What's stored per phone: only the push service's delivery address (endpoint + its two public
// keys) and the date it signed up. No names, no menu choices. Turning the reminder off deletes it.
import crypto from "node:crypto";
import { isDate } from "./schema.mjs";

export const TZ = "America/Denver";
export const MAX_SUBSCRIPTIONS = 10000;
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Only the real phone and browser notification services (Google/Android Chrome, Apple, Mozilla, Microsoft).
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

function b64urlBytes(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return -1;
  try { return Buffer.from(s.replace(/=+$/, ""), "base64url").length; } catch (e) { return -1; }
}

// A browser PushSubscription as JSON → a clean copy, or null if anything is off.
export function cleanSubscription(sub) {
  if (!sub || typeof sub !== "object" || Array.isArray(sub)) return null;
  const { endpoint, keys } = sub;
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  let u;
  try { u = new URL(endpoint); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !PUSH_HOSTS.test(u.hostname)) return null;
  if (!keys || typeof keys !== "object") return null;
  if (b64urlBytes(keys.p256dh) !== 65 || b64urlBytes(keys.auth) !== 16) return null;
  return { endpoint: u.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export const keyFor = endpoint => "sub-" + crypto.createHash("sha256").update(endpoint).digest("hex");

// Sign up or turn off. body: the parsed JSON the app sent. Returns { status, message }.
export const WELCOME = { title: "Evening reminder is on", body: "You'll get tomorrow's lunch at 7:30 PM on school nights.", url: "/" };

// welcome(sub): optional; sends the "reminder is on" notification to just this phone.
export async function handleSignup({ store, method, body, now = new Date(), welcome }) {
  if (method === "POST") {
    const sub = cleanSubscription(body && body.subscription);
    if (!sub) return { status: 400, message: "That doesn't look like a phone notification address." };
    const key = keyFor(sub.endpoint);
    const existing = await store.get(key, { type: "text" });
    if (!existing) {
      const { blobs } = await store.list();
      if (blobs.length >= MAX_SUBSCRIPTIONS) return { status: 503, message: "Reminders are full right now. Try again later." };
    }
    await store.set(key, JSON.stringify({ ...sub, since: now.toISOString().slice(0, 10) }));
    if (welcome) { try { await welcome(sub); } catch (e) { /* the reminder still works; the welcome is a courtesy */ } }
    return { status: 200, message: "Reminder on." };
  }
  if (method === "DELETE") {
    const endpoint = body && typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint || endpoint.length > 1000) return { status: 400, message: "Missing address." };
    await store.delete(keyFor(endpoint));
    return { status: 200, message: "Reminder off." };
  }
  return { status: 405, message: "Method not allowed." };
}

// The date and hour in Montana right now.
export function schoolClock(now = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).forEach(x => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
}
function nextDate(k) {
  const [y, m, d] = k.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}
const weekday = k => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// One meal on a day, the same way the app reads menu.json: {items} | {off} | {pic} | null.
function mealOn(menu, id, k) {
  if (id === "lunch" && menu.typed && Object.prototype.hasOwnProperty.call(menu.typed, k)) return menu.typed[k] ? { items: menu.typed[k] } : { off: true };
  const src = id === "lunch" ? menu : menu.breakfast || {};
  const day = (src.days || {})[k];
  if (!day) return null;
  if (day.items) return { items: day.items };
  if (day.off) return { off: true };
  return { pic: day };
}
const real = l => !!(l && (l.items || (l.pic && !l.pic.note)));

// What tomorrow's reminder says, or null if tomorrow isn't a school day (weekend, break, not posted).
export function reminderFor(menu, todayKey) {
  if (!menu || !isDate(todayKey)) return null;
  const k = nextDate(todayKey), wd = weekday(k);
  if (wd === 0 || wd === 6) return null;
  const L = mealOn(menu, "lunch", k), B = mealOn(menu, "breakfast", k);
  if (!real(L) && !real(B)) return null;
  const title = real(L) ? (L.items ? `Tomorrow: ${L.items[0]}` : "Tomorrow: see the lunch menu") : `Tomorrow (${DOW[wd]})`;
  const parts = [];
  if (real(B)) parts.push(B.items ? `Breakfast: ${B.items[0]}` : "Breakfast: see the menu");
  if (real(L)) parts.push("Tap to pick School or Home");
  return { title: title.slice(0, 80), body: parts.join(" · ").slice(0, 120), url: "/", day: k };
}

// The nightly run. send(subscription, payloadString) resolves, or rejects with { statusCode }.
// Runs twice a night (UTC) and only sends from the run that lands at 7 PM in Montana, so it's
// 7:30 PM there all year (daylight saving or not).
export async function runReminders({ store, menu, send, now = new Date(), log = console.log, force = false }) {
  const clock = schoolClock(now);
  if (!force && clock.hour !== 19) return { sent: 0, skipped: `It's ${clock.hour}:${String(clock.minute).padStart(2, "0")} in Montana, not the 7 PM hour.` };
  const msg = reminderFor(menu, clock.date);
  if (!msg) return { sent: 0, skipped: "Tomorrow isn't a school day." };
  const payload = JSON.stringify(msg);
  const { blobs } = await store.list();
  let sent = 0, removed = 0, failed = 0;
  const keys = blobs.map(b => b.key).filter(k => /^sub-[0-9a-f]{64}$/.test(k));
  for (let i = 0; i < keys.length; i += 25) {
    await Promise.all(keys.slice(i, i + 25).map(async key => {
      let sub;
      try { sub = cleanSubscription(JSON.parse(await store.get(key, { type: "text" }))); } catch (e) { sub = null; }
      if (!sub) { await store.delete(key); removed++; return; }
      try { await send(sub, payload); sent++; }
      catch (e) {
        // 404/410: the phone turned notifications off or the app was removed. Forget it.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(key); removed++; }
        else failed++;
      }
    }));
  }
  log(`Reminder "${msg.title}": sent ${sent}, removed ${removed}, failed ${failed}.`);
  return { sent, removed, failed, message: msg };
}
