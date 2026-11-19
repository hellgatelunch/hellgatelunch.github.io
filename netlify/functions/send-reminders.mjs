// The 7:30 PM (Montana) evening reminder with tomorrow's menu, to every phone that turned it on.
// Runs at 01:30 and 02:30 UTC; menu/reminder.mjs only sends from the run that is 7:30 PM in
// Montana (one of them, depending on daylight saving). The private sending key is the
// VAPID_PRIVATE_KEY environment variable in Netlify's settings, never in the code.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { runReminders } from "../../menu/reminder.mjs";
import { safeParse } from "../../menu/schema.mjs";
import { bundled } from "../../menu/site-store.mjs";
import { VAPID_PUBLIC_KEY } from "../../menu/vapid-public.mjs";

export default async () => {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) { console.log("No VAPID_PRIVATE_KEY set; reminders are off."); return; }
  webpush.setVapidDetails("https://hawkslunch.netlify.app/", VAPID_PUBLIC_KEY, priv);
  const menuText = (await getStore("menu").get("menu.json", { type: "text" })) || bundled().menu;
  const menu = menuText ? safeParse(menuText) : null;
  const r = await runReminders({
    store: getStore({ name: "reminders", consistency: "strong" }),
    menu,
    send: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: "normal", topic: "tomorrow" }),
  });
  if (r.skipped) console.log(r.skipped);
};

export const config = { schedule: "30 1,2 * * *" };
