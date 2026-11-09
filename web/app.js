// Hellgate Lunch — web app. Reads data/menu.json, which a scheduled GitHub Action builds
// from the school's monthly menu (see menu/build.mjs).
(function () {
  "use strict";

  var SWITCH_HOUR = 14; // after 2 PM, show the next school day
  var TZ = "America/Denver"; // the school's time, wherever the viewer is
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var $ = function (id) { return document.getElementById(id); };
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function key(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function fromKey(k) { var a = k.split("-"); return new Date(+a[0], +a[1] - 1, +a[2], 12); }
  function add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { return add(d, -((d.getDay() + 6) % 7)); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function weekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

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

  // What the menu says for a day: {items}, {cell}, {off: text}, {unreadable: month}, or null (not posted).
  function lunchFor(k) {
    if (Object.prototype.hasOwnProperty.call(M.typed, k)) return M.typed[k] ? { items: M.typed[k] } : { off: "No school" };
    if (M.days[k]) return { cell: M.days[k] };
    if (M.noLunch.indexOf(k) >= 0) return { off: "No lunch listed" };
    var mo = M.months[k.slice(0, 7)];
    if (mo && !mo.ok) return { unreadable: mo };
    return null;
  }

  function label(day, today) {
    var diff = Math.round((day - today) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return DOW[day.getDay()] + ", " + MON[day.getMonth()] + " " + day.getDate();
  }

  // Today until 2 PM, then the next school day. Skips days off; stops where the menu runs out.
  function pick(now) {
    var day = now.hour >= SWITCH_HOUR ? add(now.day, 1) : new Date(now.day);
    for (var i = 0; i < 21; i++, day = add(day, 1)) {
      if (weekend(day)) continue;
      var l = lunchFor(key(day));
      if (!l) break;
      if (l.off) continue;
      return { day: day, lunch: l, label: label(day, now.day) };
    }
    return { day: day, lunch: null, label: null };
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

  // HTML for one day's lunch. big = the top card, where the school's picture is shown larger.
  function body(d, l, big) {
    var k = key(d), sal = '<p class="salad">' + salad(d.getDay()) + "</p>";
    if (!l) return '<p class="main off">' + MONL[d.getMonth()] + " menu not posted yet</p>";
    if (l.off) return '<p class="main off">' + esc(l.off) + "</p>";
    if (l.unreadable) return '<p class="main off">The ' + esc(l.unreadable.name) + ' menu is posted, but its layout couldn\'t be read.</p>'
      + '<p class="sides"><a href="' + esc(l.unreadable.source) + '">Open the school\'s menu</a></p>';
    if (l.items) return '<p class="main">' + esc(l.items[0]) + "</p>"
      + (l.items.length > 1 ? '<p class="sides">' + esc(l.items.slice(1).join(" · ")) + "</p>" : "") + sal;
    return cellImg(l.cell, "Lunch for " + DOW[d.getDay()] + ", " + MONL[d.getMonth()] + " " + d.getDate() + ", from the school's menu", big ? 1.6 : 0)
      + (l.cell.note ? "" : sal);
  }

  var now, picked, week;

  function renderHero() {
    var h = $("hero");
    if (!picked.lunch) {
      h.innerHTML = '<p class="when">Next school day</p>' + body(picked.day, null);
      return;
    }
    var d = picked.day;
    var when = picked.label === "Today" || picked.label === "Tomorrow"
      ? picked.label + " · " + DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate()
      : picked.label;
    h.innerHTML = '<p class="when">' + esc(when) + "</p>" + body(d, picked.lunch, true);
  }

  function hasData(mon) {
    for (var i = 0; i < 5; i++) if (lunchFor(key(add(mon, i)))) return true;
    return false;
  }

  function renderWeek() {
    var fri = add(week, 4), thisWeek = key(monday(picked.day)) === key(week);
    $("week-title").textContent = thisWeek ? "This week" : (week.getMonth() === fri.getMonth()
      ? MONL[week.getMonth()] + " " + week.getDate() + "–" + fri.getDate()
      : MON[week.getMonth()] + " " + week.getDate() + " – " + MON[fri.getMonth()] + " " + fri.getDate());
    var html = "";
    for (var i = 0; i < 5; i++) {
      var d = add(week, i), k = key(d), l = lunchFor(k), hl = k === key(picked.day) && picked.lunch;
      var head = DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate();
      if (hl && (picked.label === "Today" || picked.label === "Tomorrow")) head = picked.label + " · " + head;
      var off = !l || l.off || l.unreadable;
      html += '<article class="card' + (hl ? " hl" : "") + (off ? " off" : "") + '"><div class="head">' + head + "</div>"
        + body(d, l).replace(/<p class="main off">/, '<p class="main">') + "</article>";
    }
    $("days").innerHTML = html;
    $("prev").disabled = !hasData(add(week, -7));
    $("next").disabled = !hasData(add(week, 7));
    $("today").hidden = thisWeek;
  }

  function renderSource() {
    var ms = Object.keys(M.months).sort().map(function (mk) { return M.months[mk]; }).filter(function (m) { return m.ok; });
    $("source").textContent = ms.length
      ? "From the school's " + ms.map(function (m) { return m.name.replace(/ \d{4}$/, ""); }).join(" and ") + " lunch menu."
      : "";
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
    renderHero(); renderWeek(); renderSource();
  }

  // Offer "Add to Home Screen" on iPhone Safari, once.
  function installHint() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    var seen = false;
    try { seen = localStorage.getItem("hl-install-hint") === "1"; } catch (e) {}
    if (!ios || standalone || seen) return;
    $("install").hidden = false;
    $("install-close").onclick = function () {
      $("install").hidden = true;
      try { localStorage.setItem("hl-install-hint", "1"); } catch (e) {}
    };
  }

  fetch("data/menu.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      // ?pictures previews how months without typed-in days look (all from the school's pictures).
      var pictures = new URLSearchParams(location.search).has("pictures");
      M = { typed: pictures ? {} : data.typed || {}, days: data.days || {}, noLunch: data.noLunch || [], months: data.months || {}, page: data.page };
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
      $("hero").innerHTML = '<p class="when">Couldn\'t load the menu</p><p class="main off">Check your connection and try again.</p>';
    });
})();
