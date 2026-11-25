// Hawks Lunch: menu calendars in Google Docs with dropdown chips.
//
// HOW TO USE (on a computer, once per batch of months):
//   1. Go to script.google.com and click "New project".
//   2. Delete what's in the editor and paste all of this in.
//   3. On the left, next to "Services", click +, pick "Google Docs API", click Add.
//   4. Edit the MENUS list just below if you want other months.
//   5. At the top, choose the function "makeMenus" and click Run. Allow access when asked
//      (it's your own script: if Google warns, click Advanced, then Go to the project).
//   6. The new Docs are in your Google Drive. Their links are in the Execution log.
//
// In each Doc, every school day has a Main chip and Side chips. Tap a chip and pick a food.
// "—" means nothing in that spot (it prints as a dash, and Hawks Lunch ignores it).
// To add a food: tap any chip, "Add/Edit Options" (it updates every chip of that kind; 50 at most).
// Days off are at the top of the Main list. When done: File > Download > PDF, and post it as usual.

var MENUS = [
  // [ "YYYY-MM", "lunch" or "breakfast" ]
  ["2026-12", "lunch"],
  ["2027-01", "lunch"],
  ["2027-01", "breakfast"],
];

var FOODS = {
 "lunch": {
  "mains": [
   "Beef Burrito",
   "Beef Chili/Cheese",
   "Beef Hot Dog",
   "Beef Meatball Sub/Cheese",
   "Beef Taco",
   "Biscuits & Sausage Gravy",
   "Cheeseburger",
   "Chicken Noodle Soup",
   "Chicken Nuggets",
   "Chicken Strips",
   "Corn Dog",
   "Grilled Cheese",
   "Orange Chicken/Rice",
   "Sloppy Joe",
   "Sweet & Sour Chicken/Rice",
   "Turkey/Cheddar Wrap"
  ],
  "sides": [
   "Apple Slices",
   "Baked Beans",
   "Black Beans",
   "Broccoli/Ranch",
   "Carrots/Ranch",
   "Celery/Ranch",
   "Chips",
   "Corn Chips",
   "Fortune Cookie",
   "Goldfish Crackers",
   "Grapes",
   "Green Beans",
   "Hummus",
   "Mandarin Oranges",
   "Mixed Berry Cup",
   "Mixed Fruit",
   "Mixed Veggies",
   "Orange Slices",
   "Oven Fries",
   "Peach Cup",
   "Peaches",
   "Pears",
   "Seasoned Tots",
   "Steamed Broccoli",
   "Steamed Peas",
   "Strawberries",
   "Tomato Soup",
   "Tri Tater"
  ]
 },
 "breakfast": {
  "mains": [
   "Apple Frudel Stick",
   "Biscuits & Sausage Gravy",
   "Breakfast Nacho Bar; Add Your Own Toppings!",
   "Cereal",
   "Chocolate Chip Muffin",
   "Chocolate Chip Oatmeal Bar",
   "Chocolate Donut",
   "Cinnamon Roll",
   "Dutch Waffle",
   "Honey Bun",
   "Maple Donut",
   "Mini Cinni",
   "Mini Pancakes",
   "Mini Strawberry Bagel",
   "Mini Waffles",
   "Oatmeal",
   "Strawberry Pop Tart",
   "Waffle Sticks/Syrup",
   "Yogurt",
   "Yogurt Bar; Add Your Own Toppings!"
  ],
  "sides": [
   "Apple Slices",
   "Cheddar Cheese Stick",
   "Cheddar Stick",
   "Juice",
   "Mandarin Oranges",
   "Mini Donuts",
   "Mixed Berries",
   "Mixed Fruit",
   "Peach Cup",
   "Peaches",
   "Pears",
   "Strawberry Cup",
   "String Cheese",
   "Tri Tater",
   "Turkey Sausage Patty",
   "Variety Fruits",
   "Yogurt"
  ]
 }
};

var DAYS_OFF = ["No School", "Winter Break", "Spring Break", "Thanksgiving Break"];
var NONE = "—";
var SLOTS = { lunch: ["main", "side1", "side2", "side3"], breakfast: ["main", "side1", "side2"] };
var GREEN = "#72AC83", TITLE_GREEN = "#5A9E6F", ORANGE = "#E46C0A";
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function makeMenus() {
  if (typeof Docs === "undefined") throw new Error('Add the "Google Docs API" service first (Services + on the left), then run again.');
  MENUS.forEach(function (m) {
    var url = makeMenu(m[0], m[1]);
    Logger.log(m[0] + " " + m[1] + ": " + url);
  });
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

function pad(n) { return (n < 10 ? "0" : "") + n; }

function makeMenu(ym, meal) {
  var year = +ym.slice(0, 4), month = +ym.slice(5, 7);
  var Meal = meal.charAt(0).toUpperCase() + meal.slice(1);
  var doc = DocumentApp.create(MONTHS[month - 1] + " " + year + " " + Meal + " Menu");
  var body = doc.getBody();
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
  // chips below through the Docs API (DocumentApp can't make dropdowns).
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
  doc.saveAndClose();

  var id = doc.getId();
  var requests = chipRequests(Docs.Documents.get(id), meal);
  Docs.Documents.batchUpdate({ requests: requests }, id);
  return "https://docs.google.com/document/d/" + id + "/edit";
}

function style(p, o) {
  p.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
  var txt = p.editAsText();
  if (!txt.getText().length) return p; // empty cell: nothing to style
  txt.setFontFamily("Calibri").setFontSize(o.size).setBold(!!o.bold).setForegroundColor(o.color || "#000000");
  return p;
}

function options(prefix, names) {
  var seen = {}, out = [];
  names.forEach(function (n) {
    if (seen[n]) return;
    seen[n] = true;
    out.push({ optionId: "dropdownItem." + prefix + pad(out.length), displayValue: n });
  });
  if (out.length > 50) throw new Error("A dropdown can hold 50 options; this list has " + out.length + ". Shorten it in FOODS.");
  return out;
}

// documents.get output -> the batchUpdate requests: two dropdown definitions (Main, Side), then
// each {{date|slot}} placeholder replaced by a chip, last one first so earlier positions stay put.
function chipRequests(docJson, meal) {
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
  })(docJson.body.content);
  marks.sort(function (a, b) { return b.start - a.start; });

  var f = FOODS[meal];
  var requests = [
    { createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionId: "kix.hlmain", dropdownDefinitionProperties: {
      title: "Main", options: options("m", [NONE].concat(DAYS_OFF, f.mains)) } } } },
    { createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionId: "kix.hlside", dropdownDefinitionProperties: {
      title: "Side", options: options("s", [NONE].concat(f.sides)) } } } },
  ];
  marks.forEach(function (k) {
    requests.push({ deleteContentRange: { range: { startIndex: k.start, endIndex: k.end } } });
    requests.push({ insertDropdown: { location: { index: k.start }, dropdownDefinitionId: k.slot === "main" ? "kix.hlmain" : "kix.hlside" } });
  });
  return requests;
}
