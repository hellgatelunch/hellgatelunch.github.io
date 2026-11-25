"""Makes a month's menu calendar as a spreadsheet with dropdowns, for Google Sheets (or Excel).

    python tools/make-menu-sheet.py 2026-12 lunch
    python tools/make-menu-sheet.py 2027-01 breakfast

Writes menu-calendars/2026-12 Lunch (Google Sheets).xlsx. Upload it to Google Drive and open it
with Google Sheets: each school day's box has dropdowns (Main, then Sides). Pick a food or type a
new one. Then File > Download > PDF and post it as usual. Same layout as the Word version
(tools/make-menu-calendar.py), so Hawks Lunch reads it the same way.

The food lists sit right of the calendar (columns H and I). Add a food at the bottom of a list and it shows up
in every dropdown (the dropdowns cover the column down to row 300).
"""
import calendar
import json
import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOODS = os.path.join(ROOT, "tools", "foods.json")
OUT_DIR = os.path.join(ROOT, "menu-calendars")

GREEN, TITLE_GREEN, ORANGE = "72AC83", "5A9E6F", "E46C0A"
DAYS_OFF = ["No School", "Winter Break", "Spring Break", "Thanksgiving Break"]
SLOTS = {"lunch": ["Main", "Side", "Side", "Side"], "breakfast": ["Main", "Side", "Side"]}
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
FONT = "Calibri"


def weeks(year, month):
    return [w[:5] for w in calendar.Calendar(firstweekday=0).monthdayscalendar(year, month) if any(w[:5])]


def make(ym, meal, out_dir=OUT_DIR):
    year, month = (int(x) for x in ym.split("-"))
    if meal not in SLOTS or not (1 <= month <= 12):
        raise SystemExit("usage: python tools/make-menu-sheet.py YYYY-MM lunch|breakfast")
    with open(FOODS, encoding="utf-8") as f:
        foods = json.load(f)[meal]
    slots = SLOTS[meal]
    rows = weeks(year, month)

    wb = Workbook()
    ws = wb.active
    ws.title = "Menu"

    # The food lists sit on this same tab, right of the calendar (outside the printed area), so
    # the dropdowns don't depend on another tab surviving the move into Google Sheets.
    # Mains (days off first) in column H, Sides in column I, with room to add more.
    ws["H1"] = "HOW TO USE: on a phone, first tap ⋮ › Save as Google Sheets (on a computer: File › Save as Google Sheets)."
    ws["H2"] = "Then tap a box under a date and pick a food. Add new foods at the bottom of a list below."
    for c in ("H1", "H2"):
        ws[c].font = Font(name=FONT, bold=True, color="C00000")
    ws["H3"], ws["I3"] = "Mains", "Sides"
    for c in ("H3", "I3"):
        ws[c].font = Font(name=FONT, bold=True)
    for i, v in enumerate(DAYS_OFF + foods["mains"], start=4):
        ws.cell(row=i, column=8, value=v).font = Font(name=FONT, size=10)
    for i, v in enumerate(foods["sides"], start=4):
        ws.cell(row=i, column=9, value=v).font = Font(name=FONT, size=10)
    ws.column_dimensions["F"].width = 4
    ws.column_dimensions["G"].width = 4
    ws.column_dimensions["H"].width = 40
    ws.column_dimensions["I"].width = 28

    # Menu tab: 5 day columns.
    for col in "ABCDE":
        ws.column_dimensions[col].width = 30
    ws.sheet_view.showGridLines = False

    ws.merge_cells("A1:E1")
    ws["A1"] = (f"{meal.capitalize()} Menu. All meals include a choice of chocolate or 1% white milk. "
                "Hellgate Elementary is an equal opportunity provider and employer.")
    ws["A1"].font = Font(name=FONT, size=9, color=ORANGE)
    ws.row_dimensions[1].height = 16
    ws.merge_cells("A2:C2")
    ws["A2"] = "Hellgate Elementary K-8"
    ws["A2"].font = Font(name=FONT, size=20, bold=True)
    ws.merge_cells("D2:E2")
    ws["D2"] = f"{calendar.month_name[month].upper()} {year}"
    ws["D2"].font = Font(name=FONT, size=22, bold=True, color=TITLE_GREEN)
    ws["D2"].alignment = Alignment(horizontal="right", vertical="center")
    ws["A2"].alignment = Alignment(vertical="center")
    ws.row_dimensions[2].height = 34

    line = Side(style="thin", color=GREEN)
    band = PatternFill("solid", fgColor=GREEN)
    for i, name in enumerate(DAY_NAMES):
        c = ws.cell(row=3, column=i + 1, value=name)
        c.font = Font(name=FONT, size=11, bold=True, color="FFFFFF")
        c.fill = band
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = Border(left=line, right=line, top=line, bottom=line)
    ws.row_dimensions[3].height = 24

    mains = DataValidation(type="list", formula1="$H$4:$H$300", allow_blank=True,
                           showErrorMessage=False, promptTitle="Main", prompt="Pick the main dish, or a day off")
    sides = DataValidation(type="list", formula1="$I$4:$I$300", allow_blank=True,
                           showErrorMessage=False, promptTitle="Side", prompt="Pick a side")
    ws.add_data_validation(mains)
    ws.add_data_validation(sides)

    per = 1 + len(slots)             # date row + one row per dropdown
    row_h = 14.5 if len(rows) <= 5 else 12.5
    r0 = 4
    for w, wk in enumerate(rows):
        top = r0 + w * per
        for r in range(top, top + per):
            ws.row_dimensions[r].height = row_h + (2 if r == top else 0)
        for c, d in enumerate(wk, start=1):
            for r in range(top, top + per):
                cell = ws.cell(row=r, column=c)
                cell.border = Border(left=line, right=line, top=line if r == top else None,
                                     bottom=line if r == top + per - 1 else None)
                cell.alignment = Alignment(vertical="top", shrink_to_fit=True)
                cell.font = Font(name=FONT, size=10)
            if not d:
                continue
            dc = ws.cell(row=top, column=c, value=d)
            dc.font = Font(name=FONT, size=11, bold=True)
            dc.alignment = Alignment(horizontal="left", vertical="top")
            for i, slot in enumerate(slots, start=1):
                ref = ws.cell(row=top + i, column=c).coordinate
                (mains if slot == "Main" else sides).add(ref)

    last = r0 + len(rows) * per - 1
    ws.print_area = f"A1:E{last}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.print_options.horizontalCentered = True

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{year:04d}-{month:02d} {meal.capitalize()} (Google Sheets).xlsx")
    wb.save(path)
    return path


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python tools/make-menu-sheet.py YYYY-MM lunch|breakfast")
    print("Wrote " + os.path.relpath(make(sys.argv[1], sys.argv[2].lower()), ROOT))
