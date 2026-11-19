// Every 6 hours: reads the school's menus and saves the website's menu data to Netlify Blobs
// (menu/site-store.mjs). If anything looks wrong, the old menu stays.
import { getStore } from "@netlify/blobs";
import { purgeCache } from "@netlify/functions";
import { runRefresh } from "../../menu/site-store.mjs";

export default async () => {
  const store = getStore({ name: "menu", consistency: "strong" });
  const result = await runRefresh({ store, purge: () => purgeCache({ tags: ["menu-data"] }) });
  console.log(result.message);
};

export const config = { schedule: "17 */6 * * *" };
