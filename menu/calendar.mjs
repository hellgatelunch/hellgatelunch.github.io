// Turns the website's menu data (web/data/menu.json) into a calendar feed parents can
// subscribe to once: one all-day event per school day, titled with lunch ("Lunch: Cheeseburger")
// so it reads at a glance in calendar widgets and on the lock screen. The notes hold the whole day.
const pad2 = n => String(n).padStart(2, "0");

// RFC 5545 text escaping.
function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }

// RFC 5545 line folding: at most 75 octets per line; continuation lines start with a space.
// Never splits a multi-byte character.
function fold(line) {
  const out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

// One meal's day entry in the shape the app uses.
function lunchOn(menu, k) {
  if (menu.typed && Object.prototype.hasOwnProperty.call(menu.typed, k)) return menu.typed[k] ? { items: menu.typed[k] } : { off: "No school" };
  return (menu.days || {})[k] || null;
}
const real = m => !!(m && (m.items || (m.img && !m.note)));
const line = (name, m) => !m ? null : m.items ? `${name}: ${m.items.join(" · ")}` : m.img ? `${name}: see the menu` : null;

// The week's Breakfast @ Break menu for a school day, or null.
function breakOn(menu, d) {
  const b = menu.break;
  if (!b || !b.menus) return null;
  const mm = b.menus.find(x => x.months.includes(d.getMonth() + 1));
  return mm ? { items: mm.days[d.getDay() - 1].concat(b.always || []) } : null;
}

// menu: the object written to web/data/menu.json. site: the website's address (for links).
export function makeIcs(menu, site = "https://hellgatelunch.github.io/") {
  const host = new URL(site).host;
  const bf = menu.breakfast || { days: {}, months: {} };
  const keys = [...new Set([...Object.keys(menu.days || {}), ...Object.keys(menu.typed || {}), ...Object.keys(bf.days || {})])].sort();

  // A month's events change only when its menu is re-cut, so their stamp is the cut date (no daily churn).
  const stamp = mk => {
    const cuts = [menu.months?.[mk]?.cut, bf.months?.[mk]?.cut].filter(Boolean).sort();
    const c = cuts[cuts.length - 1] || `${mk}-01`;
    return c.replace(/-/g, "") + "T120000Z";
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Hawks Lunch//${host}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hawks Lunch",
    "X-WR-CALDESC:" + esc("Breakfast and lunch at Hellgate Elementary K-8, from the school's menus. " + site),
    "X-WR-TIMEZONE:America/Denver",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const k of keys) {
    const [y, m, dd] = k.split("-").map(Number);
    const d = new Date(y, m - 1, dd, 12);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const L = lunchOn(menu, k), B = (bf.days || {})[k] || null;
    if (!real(L) && !real(B)) continue; // day off or not posted: no event
    const K = breakOn(menu, d);
    const title = real(L)
      ? (L.items ? `Lunch: ${L.items[0]}` : "Lunch: see the menu")
      : (B.items ? `Breakfast: ${B.items[0]}` : "Breakfast: see the menu");
    const notes = [
      line("Breakfast", real(B) ? B : null),
      line("Break (middle school)", K),
      line("Lunch", real(L) ? L : null),
      site,
    ].filter(Boolean).join("\n");
    const next = new Date(y, m - 1, dd + 1, 12);
    const ymd = x => `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ymd(d)}@${host}`,
      `DTSTAMP:${stamp(k.slice(0, 7))}`,
      `DTSTART;VALUE=DATE:${ymd(d)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      "SUMMARY:" + esc(title),
      "DESCRIPTION:" + esc(notes),
      "URL:" + site,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
