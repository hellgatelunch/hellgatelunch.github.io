"""Makes a month's menu calendar as a Word file with dropdowns for each school day.

    python tools/make-menu-calendar.py 2026-12 lunch
    python tools/make-menu-calendar.py 2027-01 breakfast

Writes menu-calendars/2026-12 Lunch.docx. The kitchen picks each day's main and sides from
dropdowns (or types a new food into one), then saves as PDF and posts it as usual. Every day's
food sits in its own box in a fixed layout, so Hawks Lunch reads it reliably.

Each dropdown is a Word combo box tagged "hl:<date>:<meal>:<slot>" (e.g. hl:2026-12-07:lunch:main),
so the .docx itself can be read exactly later. A slot left alone shows faint dots, not words, so an
unused side never prints as text and the app ignores it.

Foods come from tools/foods.json. Standard library only.
"""
import calendar
import json
import os
import sys
import zipfile
from xml.sax.saxutils import escape, quoteattr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOODS = os.path.join(ROOT, "tools", "foods.json")
OUT_DIR = os.path.join(ROOT, "menu-calendars")

GREEN = "72AC83"      # the band and lines on the school's sheets
TITLE_GREEN = "5A9E6F"
ORANGE = "E46C0A"
DOTS = "· · · · ·"  # what an unpicked slot shows (no letters)
DAYS_OFF = ["No School", "Winter Break", "Spring Break", "Thanksgiving Break"]
SLOTS = {"lunch": ["main", "side", "side", "side"], "breakfast": ["main", "side", "side"]}
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

PAGE_W, PAGE_H, MARGIN = 15840, 12240, 720   # landscape letter, half-inch margins
TABLE_W = PAGE_W - 2 * MARGIN
COL_W = TABLE_W // 5


def weeks(year, month):
    """Mon-Fri rows of the month, like the school's calendars: a row per week that has a weekday
    in the month. Each row is 5 day numbers (0 = not in this month)."""
    rows = []
    for wk in calendar.Calendar(firstweekday=0).monthdayscalendar(year, month):
        days = wk[:5]
        if any(days):
            rows.append(days)
    return rows


class Ids:
    def __init__(self):
        self.n = 1000

    def next(self):
        self.n += 1
        return self.n


def run(text, size=20, bold=False, color=None, font=None):
    rpr = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' if font is None else font
    rpr += "<w:b/>" if bold else ""
    rpr += f'<w:color w:val="{color}"/>' if color else ""
    rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def para(inner, after=0, align=None, tabs=""):
    ppr = f'<w:spacing w:before="0" w:after="{after}" w:line="240" w:lineRule="auto"/>'
    if tabs:
        ppr = tabs + ppr
    if align:
        ppr += f'<w:jc w:val="{align}"/>'
    return f"<w:p><w:pPr>{ppr}</w:pPr>{inner}</w:p>"


def dropdown(ids, tag, title, items):
    """A Word combo box: pick from the list or type something new."""
    seen, opts = set(), []
    for it in items:
        if it in seen:
            continue
        seen.add(it)
        opts.append(f"<w:listItem w:displayText={quoteattr(it)} w:value={quoteattr(it)}/>")
    rpr = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/>'
    sdt_pr = (f'<w:sdtPr><w:rPr>{rpr}</w:rPr><w:alias w:val="{title}"/><w:tag w:val="{tag}"/>'
              f'<w:id w:val="{ids.next()}"/><w:showingPlcHdr/>'
              f'<w:comboBox w:lastValue="">{"".join(opts)}</w:comboBox></w:sdtPr>')
    shown = f'<w:r><w:rPr>{rpr}<w:color w:val="BFBFBF"/></w:rPr><w:t xml:space="preserve">{DOTS}</w:t></w:r>'
    return f"<w:sdt>{sdt_pr}<w:sdtContent>{shown}</w:sdtContent></w:sdt>"


def cell(inner, fill=None, valign="top"):
    shd = f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>' if fill else ""
    return (f'<w:tc><w:tcPr><w:tcW w:w="{COL_W}" w:type="dxa"/>{shd}<w:vAlign w:val="{valign}"/></w:tcPr>'
            f"{inner}</w:tc>")


def document(year, month, meal, foods):
    ids = Ids()
    meal_name = meal.capitalize()
    month_name = calendar.month_name[month]
    lists = {"main": DAYS_OFF + foods[meal]["mains"], "side": foods[meal]["sides"]}
    rows = weeks(year, month)
    row_h = 1700 if len(rows) <= 5 else 1400

    body = []
    body.append(para(run(f"{meal_name} Menu. All meals include a choice of chocolate or 1% white milk. "
                         "Hellgate Elementary is an equal opportunity provider and employer.", size=18, color=ORANGE), after=120))
    tab = f'<w:tabs><w:tab w:val="right" w:pos="{TABLE_W}"/></w:tabs>'
    body.append(para(run("Hellgate Elementary K-8", size=40, bold=True)
                     + "<w:r><w:tab/></w:r>"
                     + run(f"{month_name.upper()} {year}", size=44, bold=True, color=TITLE_GREEN), after=160, tabs=tab))

    border = f'w:val="single" w:sz="8" w:space="0" w:color="{GREEN}"'
    tbl = [f'<w:tbl><w:tblPr><w:tblW w:w="{TABLE_W}" w:type="dxa"/>'
           f'<w:tblBorders><w:top {border}/><w:left {border}/><w:bottom {border}/><w:right {border}/>'
           f'<w:insideH {border}/><w:insideV {border}/></w:tblBorders><w:tblLayout w:type="fixed"/>'
           f'<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>'
           f'<w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>'
           f'<w:tblGrid>{"".join(f"<w:gridCol w:w=\"{COL_W}\"/>" for _ in range(5))}</w:tblGrid>']
    # Header band: day names in white on green.
    head = "".join(cell(para(run(n, size=22, bold=True, color="FFFFFF"), align="center"), fill=GREEN, valign="center") for n in DAY_NAMES)
    tbl.append(f'<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="480" w:hRule="exact"/><w:tblHeader/></w:trPr>{head}</w:tr>')
    for wk in rows:
        cells = []
        for d in wk:
            if not d:
                cells.append(cell(para("")))
                continue
            date = f"{year:04d}-{month:02d}-{d:02d}"
            inner = [para(run(str(d), size=22, bold=True), after=20)]
            for i, slot in enumerate(SLOTS[meal]):
                title = "Main" if slot == "main" else f"Side {i}"
                tag = f"hl:{date}:{meal}:{slot}" if slot == "main" else f"hl:{date}:{meal}:side{i}"
                inner.append(para(dropdown(ids, tag, title, lists[slot])))
            cells.append(cell("".join(inner)))
        tbl.append(f'<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="{row_h}" w:hRule="atLeast"/></w:trPr>{"".join(cells)}</w:tr>')
    tbl.append("</w:tbl>")
    body.append("".join(tbl))

    sect = (f'<w:sectPr><w:pgSz w:w="{PAGE_W}" w:h="{PAGE_H}" w:orient="landscape"/>'
            f'<w:pgMar w:top="{MARGIN}" w:right="{MARGIN}" w:bottom="{MARGIN}" w:left="{MARGIN}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<w:body>{"".join(body)}{para("")}{sect}</w:body></w:document>')


CONTENT_TYPES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                 '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
                 '</Types>')
RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '</Relationships>')
DOC_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>')
STYLES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>'
          '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
          '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
          '</w:styles>')


def core(title):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f"<dc:title>{escape(title)}</dc:title><dc:creator>Hawks Lunch</dc:creator></cp:coreProperties>")


def make(ym, meal, out_dir=OUT_DIR):
    year, month = (int(x) for x in ym.split("-"))
    if meal not in SLOTS or not (1 <= month <= 12):
        raise SystemExit("usage: python tools/make-menu-calendar.py YYYY-MM lunch|breakfast")
    with open(FOODS, encoding="utf-8") as f:
        foods = json.load(f)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{year:04d}-{month:02d} {meal.capitalize()}.docx")
    title = f"{calendar.month_name[month]} {year} {meal.capitalize()} Menu"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document(year, month, meal, foods))
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("docProps/core.xml", core(title))
    return path


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python tools/make-menu-calendar.py YYYY-MM lunch|breakfast")
    print("Wrote " + os.path.relpath(make(sys.argv[1], sys.argv[2].lower()), ROOT))
