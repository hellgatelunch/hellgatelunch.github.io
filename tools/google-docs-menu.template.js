// Hawks Lunch: the school year's menu calendars in one Google Doc, with dropdown chips.
//
// HOW TO USE (on a computer, once a year, or again after changing the food lists):
//   1. Go to script.google.com and click "New project" (or open your "Hawks Lunch menus" project).
//   2. Delete what's in the editor and paste all of this in.
//   3. On the left, next to "Services", click +, pick "Google Docs API", click Add.
//   4. Check SCHOOL_YEAR just below (first and last month).
//   5. At the top, choose the function "makeSchoolYear" and click Run. Allow access when asked
//      (it's your own script: if Google warns, click Advanced, then Go to the project).
//   6. The new Doc is in your Google Drive. Its link is in the Execution log.
//
// The Doc has a "Lunch" tab and a "Breakfast" tab (in the tab list on the left), each with a tab
// per month. In a month, every school day has a Main chip and Side chips. Tap a chip and pick a
// food. "—" means nothing in that spot (it prints as a dash, and Hawks Lunch ignores it).
// Days off are at the top of the Main list.
// To post a month: open its tab, File > Download > PDF (choose "Current tab"), post it as usual.
// To add a food for the rest of the year: add it to FOODS below and run again (makes a new Doc),
// or tap a chip, "Add/Edit Options" (that changes that one month's tab only).
// A dropdown holds 50 options at most: Main = "—" + days off + mains, Side = "—" + sides.

var SCHOOL_YEAR = { first: "2026-08", last: "2027-06" };
var MEALS = ["lunch", "breakfast"];

var FOODS = /*FOODS*/;

var DAYS_OFF = ["No School", "Winter Break", "Spring Break", "Thanksgiving Break"];
var NONE = "—";
var SLOTS = { lunch: ["main", "side1", "side2", "side3"], breakfast: ["main", "side1", "side2"] };
var GREEN = "#72AC83", TITLE_GREEN = "#5A9E6F", ORANGE = "#E46C0A";
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function makeSchoolYear() {
  if (typeof Docs === "undefined") throw new Error('Add the "Google Docs API" service first (Services + on the left), then run again.');
  MEALS.forEach(function (meal) { checkLists(meal); });
  var months = monthsOf(SCHOOL_YEAR.first, SCHOOL_YEAR.last);
  var y1 = SCHOOL_YEAR.first.slice(0, 4), y2 = SCHOOL_YEAR.last.slice(2, 4);
  var doc = DocumentApp.create("Hellgate " + y1 + "–" + y2 + " School Menus");
  var id = doc.getId();
  doc.saveAndClose();

  // Tabs: the first tab becomes "Lunch", then "Breakfast" beside it, then a tab per month under each.
  var first = Docs.Documents.get(id, { includeTabsContent: true }).tabs[0].tabProperties.tabId;
  var parents = {};
  parents[MEALS[0]] = first;
  var reqs = [{ updateDocumentTabProperties: { tabProperties: { tabId: first, title: cap(MEALS[0]) }, fields: "title" } }];
  MEALS.slice(1).forEach(function (meal) { reqs.push({ addDocumentTab: { tabProperties: { title: cap(meal) } } }); });
  var replies = Docs.Documents.batchUpdate({ requests: reqs }, id).replies;
  MEALS.slice(1).forEach(function (meal, i) { parents[meal] = replies[i + 1].addDocumentTab.tabProperties.tabId; });

  reqs = [];
  var order = [];
  MEALS.forEach(function (meal) {
    months.forEach(function (ym, i) {
      reqs.push({ addDocumentTab: { tabProperties: { title: monthName(ym), parentTabId: parents[meal], index: i } } });
      order.push({ meal: meal, ym: ym });
    });
  });
  replies = Docs.Documents.batchUpdate({ requests: reqs }, id).replies;
  order.forEach(function (o, i) { o.tabId = replies[i].addDocumentTab.tabProperties.tabId; });

  // Fill the tabs.
  doc = DocumentApp.openById(id);
  MEALS.forEach(function (meal) {
    var body = doc.getTab(parents[meal]).asDocumentTab().getBody();
    var p = body.getParagraphs()[0];
    p.setText(cap(meal) + " menus, " + monthName(SCHOOL_YEAR.first) + " to " + monthName(SCHOOL_YEAR.last));
    style(p, { size: 20, bold: true });
    style(body.appendParagraph("Open a month in the tab list on the left. Tap a chip under a date and pick a food; "
      + "days off are at the top of the Main list. \"—\" means nothing in that spot."), { size: 11 });
    style(body.appendParagraph("To post a month: open its tab, then File > Download > PDF (Current tab), and post it as usual."), { size: 11 });
  });
  order.forEach(function (o) { fillMonth(doc.getTab(o.tabId).asDocumentTab().getBody(), o.ym, o.meal); });
  doc.saveAndClose();

  // Swap each {{date|slot}} line for a chip, a tab at a time (each tab keeps its own lists).
  var json = Docs.Documents.get(id, { includeTabsContent: true });
  allTabs(json.tabs).forEach(function (t) {
    var meal = null;
    order.forEach(function (o) { if (o.tabId === t.tabProperties.tabId) meal = o.meal; });
    if (!meal) return;
    var r = chipRequests(t.documentTab.body, meal, t.tabProperties.tabId);
    if (r.length > 2) Docs.Documents.batchUpdate({ requests: r }, id);
  });
  var url = "https://docs.google.com/document/d/" + id + "/edit";
  Logger.log("School year menus: " + url);
  return url;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function monthName(ym) { return MONTHS[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }

function monthsOf(first, last) {
  var y = +first.slice(0, 4), m = +first.slice(5, 7), out = [];
  while (y * 100 + m <= +last.slice(0, 4) * 100 + +last.slice(5, 7)) {
    out.push(y + "-" + pad(m));
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function allTabs(tabs) {
  var out = [];
  (tabs || []).forEach(function (t) { out.push(t); out = out.concat(allTabs(t.childTabs)); });
  return out;
}

// Mon-Fri rows for the month: each row is 5 day numbers (0 = not in this month).
function weeksOf(year, month) {
  var last = new Date(year, month, 0).getDate(), rows = [], row = null;
  for (var d = 1; d <= last; d++) {
    var dow = new Date(year, month - 1, d).getDay(); // 0 Sun .. 6 Sat
    if (dow === 0 || dow === 6) continue;
    if (!row || dow === 1) { row = [0, 0, 0, 0, 0]; rows.push(row); }
    row[dow - 1] = d;
  }
  return rows;
}

// One month's page, laid out like the school's menu sheets.
function fillMonth(body, ym, meal) {
  var year = +ym.slice(0, 4), month = +ym.slice(5, 7), Meal = cap(meal);
  body.setPageWidth(792).setPageHeight(612);
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(36).setMarginRight(36);

  var note = body.getParagraphs()[0];
  note.setText(Meal + " Menu. All meals include a choice of chocolate or 1% white milk. Hellgate Elementary is an equal opportunity provider and employer.");
  style(note, { size: 9, color: ORANGE });

  // Title line: school name left, month right (a borderless 2-column table).
  var t = body.appendTable([["Hellgate Elementary K-8", MONTHS[month - 1].toUpperCase() + " " + year]]);
  t.setBorderWidth(0);
  style(t.getCell(0, 0).getChild(0).asParagraph(), { size: 20, bold: true });
  var right = t.getCell(0, 1).getChild(0).asParagraph();
  style(right, { size: 22, bold: true, color: TITLE_GREEN });
  right.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);

  // The calendar: a green band of day names, then one row per week.
  var weeks = weeksOf(year, month);
  var cells = [DAY_NAMES].concat(weeks.map(function (w) { return w.map(function (d) { return d ? String(d) : ""; }); }));
  var cal = body.appendTable(cells);
  cal.setBorderColor(GREEN).setBorderWidth(1);
  for (var c = 0; c < 5; c++) cal.setColumnWidth(c, 144);
  var head = cal.getRow(0);
  head.setMinimumHeight(24);
  for (var h = 0; h < 5; h++) {
    var hc = head.getCell(h);
    hc.setBackgroundColor(GREEN).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    var hp = hc.getChild(0).asParagraph();
    style(hp, { size: 11, bold: true, color: "#FFFFFF" });
    hp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }
  // Each school day: the date, then a placeholder line per chip ({{date|slot}}), swapped for
  // chips afterwards through the Docs API (DocumentApp can't make dropdowns).
  var rowH = weeks.length <= 5 ? 84 : 70;
  weeks.forEach(function (w, r) {
    var row = cal.getRow(r + 1);
    row.setMinimumHeight(rowH);
    w.forEach(function (d, i) {
      var cell = row.getCell(i);
      cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(4).setPaddingRight(4);
      style(cell.getChild(0).asParagraph(), { size: 11, bold: true });
      if (!d) return;
      SLOTS[meal].forEach(function (slot) {
        style(cell.appendParagraph("{{" + year + "-" + pad(month) + "-" + pad(d) + "|" + slot + "}}"), { size: 10, bold: false });
      });
    });
  });
}

function style(p, o) {
  p.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
  var txt = p.editAsText();
  if (!txt.getText().length) return p; // empty cell: nothing to style
  txt.setFontFamily("Calibri").setFontSize(o.size).setBold(!!o.bold).setForegroundColor(o.color || "#000000");
  return p;
}

function mainNames(meal) { return [NONE].concat(DAYS_OFF, FOODS[meal].mains); }
function sideNames(meal) { return [NONE].concat(FOODS[meal].sides); }

function checkLists(meal) {
  if (!FOODS[meal]) throw new Error("FOODS has no " + meal + " list.");
  [["Main", mainNames(meal)], ["Side", sideNames(meal)]].forEach(function (l) {
    var n = options("x", l[1]).length;
    if (n > 50) throw new Error("A dropdown can hold 50 options; the " + meal + " " + l[0] + " list has " + n + ". Shorten it in FOODS.");
  });
}

function options(prefix, names) {
  var seen = {}, out = [];
  names.forEach(function (n) {
    if (seen[n]) return;
    seen[n] = true;
    out.push({ optionId: "dropdownItem." + prefix + pad(out.length), displayValue: n });
  });
  return out;
}

// A tab's body -> the batchUpdate requests: two dropdown definitions (Main, Side) in that tab, then
// each {{date|slot}} placeholder replaced by a chip, last one first so earlier positions stay put.
function chipRequests(body, meal, tabId) {
  var marks = [];
  (function walk(content) {
    (content || []).forEach(function (el) {
      if (el.table) el.table.tableRows.forEach(function (r) { r.tableCells.forEach(function (c) { walk(c.content); }); });
      if (!el.paragraph) return;
      el.paragraph.elements.forEach(function (pe) {
        if (!pe.textRun) return;
        var re = /\{\{(\d{4}-\d\d-\d\d)\|(main|side\d)\}\}/g, m;
        while ((m = re.exec(pe.textRun.content))) marks.push({ start: pe.startIndex + m.index, end: pe.startIndex + m.index + m[0].length, slot: m[2] });
      });
    });
  })(body.content);
  marks.sort(function (a, b) { return b.start - a.start; });

  var requests = [
    { createDropdownDefinition: { tabId: tabId, dropdownDefinition: { dropdownDefinitionId: "kix.hlmain", dropdownDefinitionProperties: {
      title: "Main", options: options("m", mainNames(meal)) } } } },
    { createDropdownDefinition: { tabId: tabId, dropdownDefinition: { dropdownDefinitionId: "kix.hlside", dropdownDefinitionProperties: {
      title: "Side", options: options("s", sideNames(meal)) } } } },
  ];
  marks.forEach(function (k) {
    requests.push({ deleteContentRange: { range: { startIndex: k.start, endIndex: k.end, tabId: tabId } } });
    requests.push({ insertDropdown: { location: { index: k.start, tabId: tabId }, dropdownDefinitionId: k.slot === "main" ? "kix.hlmain" : "kix.hlside" } });
  });
  return requests;
}
