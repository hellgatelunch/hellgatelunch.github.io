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
    { id: "breakfast", label: "Breakfast" },
    { id: "break", label: "Breakfast @ Break", tag: "Middle school" },
    { id: "lunch", label: "Lunch" },
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

  // What one menu says for a day: {items}, {cell}, {off: text}, {unreadable: month}, or null (not posted).
  function fromMonthly(meal, k) {
    if (meal.days[k]) return { cell: meal.days[k] };
    if (meal.noLunch.indexOf(k) >= 0) return { off: "Nothing listed" };
    var mo = meal.months[k.slice(0, 7)];
    if (mo && !mo.ok) return { unreadable: mo };
    return null;
  }
  function real(l) { return !!(l && (l.items || (l.cell && !l.cell.note))); }
  function schoolDay(d) { var k = key(d); return !weekend(d) && (real(mealFor("lunch", d)) || real(mealFor("breakfast", d))); }

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
    if (b3 && b4) return "Salad bar: Building 3 and Building 4";
    if (b4) return "Salad bar: Building 4";
    return "No salad bar on Tuesdays";
  }

  function cellImg(c, alt, scale) {
    return '<img class="cell" src="data/' + esc(c.img) + '" width="' + c.w + '" height="' + c.h + '" alt="' + esc(alt) + '"'
      + (scale ? ' style="width:' + Math.round(c.w * scale) + 'px"' : "") + ">";
  }

  // One meal's food. big = the top card, where things are shown larger.
  function food(id, d, l, big) {
    var when = DOW[d.getDay()] + ", " + MONL[d.getMonth()] + " " + d.getDate();
    var name = id === "lunch" ? "Lunch" : id === "breakfast" ? "Breakfast" : "Breakfast @ Break";
    if (!l) return '<p class="none">' + MONL[d.getMonth()] + " " + (id === "break" ? name : name.toLowerCase()) + " menu not posted yet</p>";
    if (l.off) return '<p class="none">' + esc(l.off) + "</p>";
    if (l.unreadable) return '<p class="none">Posted, but the layout couldn\'t be read. <a href="' + esc(l.unreadable.source) + '">Open the school\'s menu</a></p>';
    var extra = id === "lunch" ? '<p class="salad">' + salad(d.getDay()) + "</p>" : "";
    if (l.items) return '<p class="main">' + esc(l.items[0]) + "</p>"
      + (l.items.length > 1 ? '<p class="sides">' + esc(l.items.slice(1).join(" · ")) + "</p>" : "") + extra;
    return cellImg(l.cell, name + " for " + when + ", from the school's menu", big ? 1.25 : 0) + extra;
  }

  // A whole day: each chosen meal, or one "no school" note for a day off.
  function dayHTML(d, big) {
    var k = key(d);
    if (!schoolDay(d)) {
      var L = mealFor("lunch", d), B = mealFor("breakfast", d);
      if (L && L.off === "No school") return '<p class="none big-none">No school</p>';
      var note = (L && L.cell && L.cell.note && L.cell) || (B && B.cell && B.cell.note && B.cell);
      if (note) return cellImg(note, "Note from the school's menu for " + k, big ? 1.25 : 0);
      if (!L && !B) return '<p class="none big-none">' + MONL[d.getMonth()] + " menu not posted yet</p>";
      return '<p class="none big-none">No meals listed</p>';
    }
    var html = "";
    MEALS.forEach(function (m) {
      if (!show[m.id]) return;
      var l = mealFor(m.id, d);
      if (m.id === "break" && !l) return; // no break menu for this month: leave it out
      html += '<section class="meal meal-' + m.id + '"><h3 class="meal-label">' + m.label
        + (m.tag ? ' <span class="tag">' + m.tag + "</span>" : "") + "</h3>" + food(m.id, d, l, big) + "</section>";
    });
    return html || '<p class="none">Choose a meal to show above.</p>';
  }

  var now, picked, week;

  function renderHero() {
    var h = $("hero"), d = picked.day;
    if (!picked.ok) {
      h.innerHTML = '<p class="when">Next school day</p><p class="none big-none">' + MONL[d.getMonth()] + " menu not posted yet</p>";
      return;
    }
    var when = picked.label === "Today" || picked.label === "Tomorrow"
      ? picked.label + " · " + DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate()
      : picked.label;
    h.innerHTML = '<p class="when">' + esc(when) + "</p>" + dayHTML(d, true);
  }

  function hasData(mon) {
    for (var i = 0; i < 5; i++) { var d = add(mon, i); if (mealFor("lunch", d) || mealFor("breakfast", d)) return true; }
    return false;
  }

  function renderWeek() {
    var fri = add(week, 4), thisWeek = key(monday(picked.day)) === key(week);
    $("week-title").textContent = thisWeek ? "This week" : (week.getMonth() === fri.getMonth()
      ? MONL[week.getMonth()] + " " + week.getDate() + "–" + fri.getDate()
      : MON[week.getMonth()] + " " + week.getDate() + " – " + MON[fri.getMonth()] + " " + fri.getDate());
    var html = "";
    for (var i = 0; i < 5; i++) {
      var d = add(week, i), hl = picked.ok && key(d) === key(picked.day);
      var head = DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate();
      if (hl && (picked.label === "Today" || picked.label === "Tomorrow")) head = picked.label + " · " + head;
      html += '<article class="card' + (hl ? " hl" : "") + (schoolDay(d) ? "" : " off") + '"><h3 class="head">' + head + "</h3>"
        + dayHTML(d, false) + "</article>";
    }
    $("days").innerHTML = html;
    $("prev").disabled = !hasData(add(week, -7));
    $("next").disabled = !hasData(add(week, 7));
    $("today").hidden = thisWeek;
  }

  function renderToggles() {
    var html = "";
    MEALS.forEach(function (m) {
      html += '<button type="button" class="chip" data-meal="' + m.id + '" aria-pressed="' + show[m.id] + '">'
        + (m.id === "break" ? "Middle school break" : m.label) + "</button>";
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
      $("hero").innerHTML = '<p class="when">Couldn\'t load the menu</p><p class="none big-none">Check your connection and try again.</p>';
    });
})();
