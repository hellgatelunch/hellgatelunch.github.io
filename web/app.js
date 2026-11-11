// Hellgate Lunch — web app. Reads data/menu.json, which a scheduled GitHub Action builds
// from the school's monthly breakfast and lunch menus (see menu/build.mjs).
(function () {
  "use strict";

  var SWITCH_HOUR = 14; // after 2 PM, show the next school day
  var TZ = "America/Denver"; // the school's time, wherever the viewer is
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // In the order they're served.
  var MEALS = [
    { id: "breakfast", short: "Breakfast", chip: "Breakfast" },
    { id: "break", short: "Break", chip: "Middle school break", tag: "Middle school" },
    { id: "lunch", short: "Lunch", chip: "Lunch" },
  ];

  var $ = function (id) { return document.getElementById(id); };
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function key(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { return add(d, -((d.getDay() + 6) % 7)); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function weekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // Today's date and hour in Montana. ?now=2026-11-23T15:00 pretends it's another time.
  function schoolNow() {
    var q = new URLSearchParams(location.search).get("now");
    if (q) {
      var m = q.match(/^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d))?/);
      if (m) return { day: new Date(+m[1], +m[2] - 1, +m[3], 12), hour: +(m[4] || 9) };
    }
    var parts = {};
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { day: new Date(+parts.year, +parts.month - 1, +parts.day, 12), hour: +parts.hour };
  }

  var M = null;

  // Which meals to show (the viewer's choice, remembered on this device).
  var show = { breakfast: true, "break": true, lunch: true };
  try { var saved = JSON.parse(store("hl-meals") || "null"); if (saved) for (var s in show) if (has(saved, s)) show[s] = !!saved[s]; } catch (e) {}

  // One small line icon per meal (stroke = the meal's color).
  // One food icon per meal (stroke = the meal's color): bacon and eggs, apple, fork and knife.
  var ICONS = {
    breakfast: '<path d="M2.6 10.2c.1-2.9 2.6-5 5.4-4.7 2.2.2 3.8 1.9 4.1 3.9 1 1 1.3 2.6.7 3.9-.7 1.6-2.4 2.4-4 2.2-1.2 1.3-3.3 1.6-4.8.6-1.4-1-1.9-2.6-1.6-4 .1-.6.1-1.3.2-1.9z"/><circle cx="7.6" cy="10.4" r="2.2" fill="currentColor" stroke="none"/><path d="M16 3c-1.4 2 1.4 4 0 6s1.4 4 0 6 1.4 4 0 6"/><path d="M21.5 3c-1.4 2 1.4 4 0 6s1.4 4 0 6 1.4 4 0 6"/><path d="M16 3h5.5M16 21h5.5"/><path d="M18.75 5.2c-1 1.5 1 2.8 0 4.3s1 2.8 0 4.3 1 2.8 0 4.3"/>',
    "break": '<path d="M12 7.5c-1.6-1.2-5.5-1.6-6.6 1.6-1.2 3.4.9 9.4 3.9 10.6 1.1.4 1.8-.3 2.7-.3s1.6.7 2.7.3c3-1.2 5.1-7.2 3.9-10.6-1.1-3.2-5-2.8-6.6-1.6z"/><path d="M12 7.5c0-2 .8-3.6 2.6-4.5"/>',
    lunch: '<path d="M6 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M8.5 3v18"/><path d="M17 21V3c2 1.2 3 3.8 3 8h-3"/>'
  };
  function icon(id) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[id] + "</svg>"; }

  // What one monthly menu says for a day: {items}, {off: text}, {pic}, {unreadable: month}, or null (not posted).
  function fromMonthly(meal, k) {
    var day = meal.days[k];
    if (day) {
      if (day.items) return { items: day.items };
      if (day.off) return { off: day.off };
      return { pic: day }; // words couldn't be read: a picture of the school's box
    }
    if (meal.noLunch.indexOf(k) >= 0) return { off: "Nothing listed" };
    var mo = meal.months[k.slice(0, 7)];
    if (mo && !mo.ok) return { unreadable: mo };
    return null;
  }
  function real(l) { return !!(l && (l.items || (l.pic && !l.pic.note))); }
  function schoolDay(d) { return !weekend(d) && (real(mealFor("lunch", d)) || real(mealFor("breakfast", d))); }

  function mealFor(id, d) {
    var k = key(d);
    if (id === "lunch") {
      if (has(M.typed, k)) return M.typed[k] ? { items: M.typed[k] } : { off: "No school" };
      return fromMonthly(M.lunch, k);
    }
    if (id === "breakfast") return fromMonthly(M.breakfast, k);
    // Breakfast @ Break: same menu every week of a month, on school days only.
    if (!M.brk || weekend(d) || !schoolDay(d)) return null;
    for (var i = 0; i < M.brk.menus.length; i++) {
      var mm = M.brk.menus[i];
      if (mm.months.indexOf(d.getMonth() + 1) >= 0) return { items: mm.days[d.getDay() - 1].concat(M.brk.always || []) };
    }
    return null;
  }

  function label(day, today) {
    var diff = Math.round((day - today) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return DOW[day.getDay()] + ", " + MON[day.getMonth()] + " " + day.getDate();
  }

  // Today until 2 PM, then the next school day. Skips days off; stops where the menus run out.
  function pick(now) {
    var day = now.hour >= SWITCH_HOUR ? add(now.day, 1) : new Date(now.day);
    for (var i = 0; i < 21; i++, day = add(day, 1)) {
      if (weekend(day)) continue;
      if (!mealFor("lunch", day) && !mealFor("breakfast", day)) break;
      if (schoolDay(day)) return { day: day, ok: true, label: label(day, now.day) };
    }
    return { day: day, ok: false, label: null };
  }

  function salad(dow) {
    var b3 = dow === 1 || dow === 5, b4 = dow !== 2;
    if (b3 && b4) return "Salad bar: Bldg 3 and 4";
    if (b4) return "Salad bar: Bldg 4";
    return "No salad bar Tue";
  }

  // Foods the kid likes (1) or doesn't (-1), saved separately for each meal
  // ("lunch|cheeseburger"). Kept on this phone only; never sent anywhere.
  var likes = {};
  try { likes = JSON.parse(store("hl-likes") || "{}") || {}; } catch (e) { likes = {}; }
  function foodKey(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }
  function likeKey(meal, s) { return meal + "|" + foodKey(s); }
  // Ratings saved before they were per meal ("cheeseburger") apply to every meal: convert them once.
  Object.keys(likes).forEach(function (k) {
    if (k.indexOf("|") >= 0) return;
    MEALS.forEach(function (m) { if (!has(likes, m.id + "|" + k)) likes[m.id + "|" + k] = likes[k]; });
    delete likes[k];
  });
  function liking(meal, s) { var k = likeKey(meal, s); return has(likes, k) ? likes[k] : 0; }
  function rate(meal, s, v) {
    var k = likeKey(meal, s);
    if (likes[k] === v) delete likes[k]; else likes[k] = v; // tapping again clears it
    store("hl-likes", JSON.stringify(likes));
    store("hl-likes-hint", "1");
  }
  // Ask the browser to keep this site's saved data (ratings, meal choices) instead of clearing it when space runs low.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  var openRow = null; // the week row whose rating buttons are showing

  var HEART = '<path d="M12 20s-7-4.4-9-8.6C1.6 8.4 3.4 5 6.8 5c2 0 3.3 1.1 5.2 3 1.9-1.9 3.2-3 5.2-3 3.4 0 5.2 3.4 3.8 6.4C19 15.6 12 20 12 20z"/>';
  var THUMB = '<path d="M7 13V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3a4 4 0 0 1 4 4v1a2 2 0 0 0 4 0v-5h3a2 2 0 0 0 2-2l-1-5a2 3 0 0 0-2-2h-7a3 3 0 0 0-3 3"/>';
  function svg(paths, cls) { return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>"; }

  // The two rating buttons for a food.
  function rateButtons(meal, name) {
    var v = liking(meal, name), f = esc(name), at = ' data-meal="' + meal + '" data-food="' + f + '"';
    return '<span class="rate">'
      + '<button type="button" class="rate-btn like"' + at + ' data-v="1" aria-pressed="' + (v > 0) + '" aria-label="Likes ' + f + '">' + svg(HEART) + "</button>"
      + '<button type="button" class="rate-btn nope"' + at + ' data-v="-1" aria-pressed="' + (v < 0) + '" aria-label="Doesn\'t like ' + f + '">' + svg(THUMB) + "</button>"
      + "</span>";
  }

  // The verdict for a meal's main item: big tag in the top card, small mark in the week.
  function verdict(id, l, big) {
    if (!l || !l.items) return "";
    var v = liking(id, l.items[0]);
    if (!v) return "";
    if (v > 0) return big ? '<span class="verdict fav">' + svg(HEART, "filled") + "Favorite</span>" : '<span class="mark fav" title="Favorite">' + svg(HEART, "filled") + "</span>";
    if (id === "lunch") return big ? '<span class="verdict pack">Maybe pack a lunch</span>' : '<span class="mark pack">Pack?</span>';
    return big ? '<span class="verdict meh">Not a favorite</span>' : '<span class="mark meh" title="Not a favorite">' + svg(THUMB) + "</span>";
  }

  // A picture of the school's box, drawn in the text color (no white box). scale is about the text size.
  function pic(p, alt, scale) {
    var src = "url(data/" + esc(p.img) + ")";
    return '<span class="pic" role="img" aria-label="' + esc(alt) + '" style="width:' + Math.round(p.w * scale) + "px;aspect-ratio:"
      + p.w + "/" + p.h + ";-webkit-mask-image:" + src + ";mask-image:" + src + '"></span>';
  }

  function mealName(id) { return id === "lunch" ? "Lunch" : id === "breakfast" ? "Breakfast" : "Breakfast @ Break"; }
  function notPosted(id, d) { return MONL[d.getMonth()] + " " + (id === "break" ? "Breakfast @ Break" : mealName(id).toLowerCase()) + " menu not posted yet"; }

  // What's served, as the top card shows it (big) or as a compact week row.
  function food(id, d, l, big, rowKey) {
    var alt = mealName(id) + " for " + DOW[d.getDay()] + ", " + MONL[d.getMonth()] + " " + d.getDate() + ", from the school's menu";
    var t = big ? "p" : "span";
    var wrap = function (cls, html) { return "<" + t + ' class="' + cls + '">' + html + "</" + t + ">"; };
    if (!l) return wrap("none", notPosted(id, d));
    if (l.off) return wrap("none", esc(l.off));
    if (l.unreadable) return wrap("none", "Couldn't read this menu. <a href=\"" + esc(l.unreadable.source) + "\">Open the school's menu</a>");
    if (l.pic) return pic(l.pic, alt, big ? 0.95 : 0.72);
    var main = l.items[0], sides = l.items.length > 1 ? esc(l.items.slice(1).join(" · ")) : "";
    if (big) {
      return '<div class="main-line"><p class="main">' + esc(main) + "</p>" + rateButtons(id, main) + "</div>"
        + (sides ? '<p class="sides">' + sides + "</p>" : "");
    }
    // Week: tap the main item to rate it; marks show what's already rated.
    return '<button type="button" class="main main-btn" data-row="' + rowKey + '" aria-expanded="' + (openRow === rowKey) + '">' + esc(main) + "</button>"
      + verdict(id, l, false)
      + (sides ? '<span class="sides">' + sides + "</span>" : "")
      + (openRow === rowKey ? '<span class="row-rate">' + rateButtons(id, main) + '<span class="rate-help">Does your kid like it?</span></span>' : "");
  }

  function mealLabel(m, big) {
    var sub = !m.tag ? "" : big ? ' <span class="ms">' + m.tag + "</span>" : '<span class="label-sub">' + m.tag + "</span>";
    return '<span class="label">' + icon(m.id) + "<span>" + m.short + "</span>" + (big ? sub : "") + "</span>" + (big ? "" : sub);
  }

  // A day off: one line (or the school's note), instead of three empty meals.
  function offDay(d, big) {
    var L = mealFor("lunch", d), B = mealFor("breakfast", d), cls = big ? "day-off" : "none-day";
    var off = (L && L.off) || (B && B.off);
    var note = (L && L.pic && L.pic.note && L.pic) || (B && B.pic && B.pic.note && B.pic);
    if (off && off !== "Nothing listed") return '<p class="' + cls + '">' + esc(off) + "</p>";
    if (note) return pic(note, "Note from the school's menu", big ? 0.95 : 0.72);
    if (!L && !B) return '<p class="' + cls + '">' + MONL[d.getMonth()] + " menu not posted yet</p>";
    return '<p class="' + cls + '">No meals listed</p>';
  }

  // A whole day: each chosen meal in serving order.
  function dayHTML(d, big) {
    if (!schoolDay(d)) return offDay(d, big);
    var html = "";
    MEALS.forEach(function (m) {
      if (!show[m.id]) return;
      var l = mealFor(m.id, d);
      if (m.id === "break" && !l) return; // no break menu for this month: leave it out
      var extra = m.id === "lunch" && real(l) ? '<p class="salad">' + salad(d.getDay()) + "</p>" : "";
      html += big
        ? '<section class="meal m-' + m.id + '"><h3 class="meal-head">' + mealLabel(m, true) + verdict(m.id, l, true) + "</h3>"
          + food(m.id, d, l, true) + extra + "</section>"
        : '<div class="row m-' + m.id + '"><span class="label-col">' + mealLabel(m, false) + '</span><span class="what">'
          + food(m.id, d, l, false, key(d) + "/" + m.id) + "</span></div>";
    });
    return html || '<p class="none">Turn on a meal below to see it here.</p>';
  }

  // One handler for every rating button and tappable week item (they're redrawn often).
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".rate-btn, .main-btn, #hint-close");
    if (!b) return;
    var byKeyboard = e.detail === 0; // Enter/Space on a focused button, not a tap
    if (b.id === "hint-close") { store("hl-likes-hint", "1"); renderHero(); return; }
    if (b.classList.contains("main-btn")) {
      var r = b.getAttribute("data-row");
      openRow = openRow === r ? null : r;
      renderWeek();
      var again = document.querySelector('.main-btn[data-row="' + r + '"]');
      if (again && byKeyboard) again.focus();
      return;
    }
    rate(b.getAttribute("data-meal"), b.getAttribute("data-food"), +b.getAttribute("data-v"));
    var sel = '.rate-btn[data-meal="' + b.getAttribute("data-meal") + '"][data-food="' + b.getAttribute("data-food").replace(/"/g, '\\"') + '"][data-v="' + b.getAttribute("data-v") + '"]';
    var inHero = !!b.closest("#hero");
    renderHero(); renderWeek();
    // Keep keyboard users on the button they pressed (a tap doesn't need the focus ring).
    var back = document.querySelector((inHero ? "#hero " : "#days ") + sel);
    if (back && byKeyboard) back.focus();
  });

  var now, picked, week;

  function renderHero() {
    var h = $("hero"), d = picked.day;
    if (!picked.ok) {
      h.innerHTML = '<p class="when">Next school day</p><p class="day-off">' + MONL[d.getMonth()] + " menu not posted yet</p>";
      return;
    }
    var near = picked.label === "Today" || picked.label === "Tomorrow";
    h.innerHTML = '<p class="when">' + (near ? picked.label : "Next school day") + "</p>"
      + '<p class="date">' + DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate() + "</p>"
      + dayHTML(d, true)
      + (store("hl-likes-hint") !== "1" && !Object.keys(likes).length
        ? '<p class="hint">' + svg(HEART) + "<span>Tap the heart on foods your kid likes. Thumbs down flags lunches to pack.</span>"
          + '<button type="button" id="hint-close">Got it</button></p>'
        : "");
  }

  function hasData(mon) {
    for (var i = 0; i < 5; i++) { var d = add(mon, i); if (mealFor("lunch", d) || mealFor("breakfast", d)) return true; }
    return false;
  }

  function renderWeek() {
    var fri = add(week, 4), home = key(monday(picked.day)) === key(week), wk = key(week);
    var rel = wk === key(monday(now.day)) ? "This week" : wk === key(add(monday(now.day), 7)) ? "Next week" : "";
    $("week-title").textContent = rel || (week.getMonth() === fri.getMonth()
      ? MONL[week.getMonth()] + " " + week.getDate() + "–" + fri.getDate()
      : MON[week.getMonth()] + " " + week.getDate() + " – " + MON[fri.getMonth()] + " " + fri.getDate());
    var html = "";
    for (var i = 0; i < 5; i++) {
      var d = add(week, i), hl = picked.ok && key(d) === key(picked.day);
      var pill = hl ? '<span class="pill">' + (picked.label === "Today" || picked.label === "Tomorrow" ? picked.label : "Next") + "</span>" : "";
      html += '<article class="card' + (hl ? " hl" : "") + (schoolDay(d) ? "" : " off") + '"><h3 class="head">'
        + DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate() + pill + "</h3>" + dayHTML(d, false) + "</article>";
    }
    $("days").innerHTML = html;
    $("prev").disabled = !hasData(add(week, -7));
    $("next").disabled = !hasData(add(week, 7));
    $("today").hidden = home;
  }

  function renderToggles() {
    var html = "";
    MEALS.forEach(function (m) {
      html += '<button type="button" class="chip m-' + m.id + '" data-meal="' + m.id + '" aria-pressed="' + show[m.id] + '">'
        + icon(m.id) + '<span class="chip-name">' + m.short + "</span></button>";
    });
    $("toggles").innerHTML = html;
    Array.prototype.forEach.call($("toggles").querySelectorAll(".chip"), function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-meal"), on = 0;
        show[id] = !show[id];
        for (var s in show) if (show[s]) on++;
        if (!on) show[id] = true; // keep at least one
        store("hl-meals", JSON.stringify(show));
        renderToggles(); renderHero(); renderWeek();
      };
    });
  }

  function renderSource() {
    var names = [];
    ["breakfast", "lunch"].forEach(function (id) {
      var ms = M[id].months, list = Object.keys(ms).sort().filter(function (mk) { return ms[mk].ok; });
      if (list.length) names.push(id);
    });
    var months = {};
    [M.breakfast.months, M.lunch.months].forEach(function (ms) {
      Object.keys(ms).forEach(function (mk) { if (ms[mk].ok) months[mk] = ms[mk].name.replace(/ \d{4}$/, ""); });
    });
    var mlist = Object.keys(months).sort().map(function (mk) { return months[mk]; });
    $("source").textContent = names.length
      ? "From the school's " + mlist.join(" and ") + " " + names.join(" and ") + " menus."
      : "";
    var b = M.brk;
    $("break-note").innerHTML = b ? esc(b.note) + (b.newSheet
      ? ' <strong>The school posted a new Breakfast @ Break menu:</strong> <a href="' + esc(b.newSheet) + '">see it here</a>.' : "") : "";
    if (M.page) $("page-link").href = M.page;
  }

  function go(n) { week = n === 0 ? monday(picked.day) : add(week, 7 * n); renderWeek(); }
  $("prev").onclick = function () { go(-1); };
  $("next").onclick = function () { go(1); };
  $("today").onclick = function () { go(0); };
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (e.key === "ArrowLeft" && !$("prev").disabled) go(-1);
    if (e.key === "ArrowRight" && !$("next").disabled) go(1);
  });

  function render() {
    now = schoolNow();
    picked = pick(now);
    week = monday(picked.day);
    renderToggles(); renderHero(); renderWeek(); renderSource();
  }

  // Offer "Add to Home Screen": on iPhone as instructions (Safari has no install button),
  // on Android/Chrome as a real Install button. Hidden once dismissed or installed.
  var installEvent = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvent = e; installHint(); });
  window.addEventListener("appinstalled", function () { $("install").hidden = true; store("hl-install-hint", "1"); });
  function installHint() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    if (standalone || store("hl-install-hint") === "1" || !M || (!ios && !installEvent)) return;
    if (installEvent) {
      $("install-text").innerHTML = "<strong>Put it on your home screen</strong> to open it like an app.";
      $("install-go").hidden = false;
      $("install-go").onclick = function () {
        installEvent.prompt();
        installEvent.userChoice.then(function () { installEvent = null; $("install").hidden = true; });
      };
    }
    $("install").hidden = false;
    $("install-close").onclick = function () { $("install").hidden = true; store("hl-install-hint", "1"); };
  }

  // Works offline after the first visit (and lets Android offer to install it).
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // "Get it in your calendar". iPhone: one tap subscribes (webcal:). Google can only add a
  // calendar from a computer, so its button opens the two-step how-to instead of a dead link.
  (function () {
    var base = location.host + location.pathname.replace(/[^/]*$/, "");
    $("cal-apple").href = "webcal://" + base + "calendar.ics";
    $("cal-google").onclick = function () {
      var open = $("cal-google-help").hidden;
      $("cal-google-help").hidden = !open;
      $("cal-google").setAttribute("aria-expanded", String(open));
    };
    $("cal-copy").onclick = function () {
      var url = location.protocol + "//" + base + "calendar.ics";
      var done = function () { $("cal-copy").textContent = "Link copied"; setTimeout(function () { $("cal-copy").textContent = "Copy calendar link"; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this calendar link:", url); });
      else prompt("Copy this calendar link:", url);
    };
  })();

  // Share the link with other parents (phones' share sheet; elsewhere, copy it).
  $("share").onclick = function () {
    var url = location.origin + location.pathname;
    if (navigator.share) { navigator.share({ title: "Hellgate Lunch", text: "Breakfast and lunch at Hellgate K-8", url: url }).catch(function () {}); return; }
    var done = function () { $("share").textContent = "Link copied"; setTimeout(function () { $("share").textContent = "Share with other parents"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    else prompt("Copy this link:", url);
  };

  fetch("data/menu.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      // ?pictures previews how months without typed-in days look (all from the school's pictures).
      var pictures = new URLSearchParams(location.search).has("pictures");
      var empty = { months: {}, days: {}, noLunch: [] };
      M = {
        typed: pictures ? {} : data.typed || {},
        lunch: { months: data.months || {}, days: data.days || {}, noLunch: data.noLunch || [] },
        breakfast: data.breakfast || empty,
        brk: data["break"] || null,
        page: data.page,
      };
      render();
      installHint();
      // Coming back to the app later in the day (or the next day): recompute.
      var lastKey = key(now.day) + now.hour;
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        var n = schoolNow();
        if (key(n.day) + n.hour !== lastKey) { lastKey = key(n.day) + n.hour; render(); }
      });
    })
    .catch(function () {
      $("hero").innerHTML = '<p class="when">Couldn\'t load the menu</p><p class="day-off">Check your connection and try again.</p>';
    });
})();
