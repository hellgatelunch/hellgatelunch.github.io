# Hellgate Lunch

Two ways to see the Hellgate Elementary K-8 school lunch:

- **The website: <https://l33-dot.github.io/hellgate-lunch/>.** Open it on any phone or computer. On iPhone, tap Share → *Add to Home Screen* and it opens like an app. No setup.
- **The iPhone widget** (below). A home-screen widget that always shows the next lunch.

Both read the school's own monthly lunch menu and show each day's box from it.

## The website

`web/` is a static site published with GitHub Pages. A GitHub Action (`.github/workflows/menu.yml`) runs every 6 hours. It reads the school's menu page, cuts each day's box out of the lunch menu, saves the pictures in `web/data/`, commits them if anything changed, and republishes the site. When the school posts next month's menu, the site picks it up within 6 hours, with nothing to tap.

- Before 2 PM (Montana time) the top card shows today's lunch; after 2 PM, the next school day.
- Below it is the week, with arrows (or ← →) to flip weeks.
- To force a refresh, open the repository's **Actions** tab → *Refresh menu and publish site* → **Run workflow**.
- GitHub pauses scheduled Actions in a repository with no activity for 60 days. Menu updates commit to the repository, so this shouldn't happen during the school year. After summer break, re-enable it from the Actions tab if needed.

Preview switches: `?now=2026-11-24T15:00` pretends it's another time, and `?pictures` ignores the typed-in days and shows only the school's pictures.

## The iPhone widget

A small (2×2) home screen widget that shows the Hellgate Elementary K-8 school lunch. Tap it to see the whole week.

- Before 2 PM it shows today's lunch. After 2 PM it switches to the next school day.
- Each month it reads the new lunch menu straight from the school's website and shows that day's box from the school's own menu.
- The full-week screen shows every day of the week, with arrows to flip between weeks.

It runs in **Scriptable**, a free app that lets you make your own widgets. You only need to set it up once.

### Set it up (about 5 minutes)

#### 1. Install Scriptable
Get **Scriptable** (by Simon B. Støvring) from the App Store. It's free.

#### 2. Add the script
1. Open Scriptable and tap **+** in the top-right corner.
2. Tap the title at the top ("Untitled Script") and rename it **Hellgate Lunch**.
3. Copy all of the code in [`hellgate-lunch.js`](hellgate-lunch.js), from `// Hellgate Lunch` to the last line, and paste it into the script. If you already have the old version, replace all of it.
4. Tap **Done**.
5. To check it, tap the script once in Scriptable. The full-week menu should open. Tap **Close** when you're done looking.

#### 3. Put the widget on your home screen
1. Long-press an empty spot on the home screen until the apps jiggle.
2. Tap **Edit** in the top-left corner, then **Add Widget**. On older iOS versions, tap **+** instead.
3. Search for **Scriptable**, pick the small square size, and tap **Add Widget**.
4. While the apps are still jiggling, tap the new widget. If it doesn't open its settings, long-press it and choose **Edit Widget**.
5. Set:
   - **Script:** Hellgate Lunch
   - **When Interacting:** Run Script
6. Tap outside the panel, then tap **Done**.

The widget fills in within a few seconds.

### Each month
The widget checks the school's menu page a few times a day. When the next month's lunch menu is posted, the widget says **"Tap to load the December menu"** (or whichever month). Tap the widget once. It downloads the menu from the school's website and cuts out each day's box. That's it.

Days the school marks off (like **NO SCHOOL**) show the school's own note. A day with nothing written in its box is skipped.

If the school ever changes the menu's layout so the boxes can't be found, the week screen says so and links straight to that month's menu.

---

## How it works (for whoever maintains this)

- **Finding the menu.** The school's page (Finalsite) doesn't link to the menu. It shows the PDF as an `<img>` with an empty `src` and puts the file's addresses, URL-encoded, in `data-image-sizes`. The script reads those, along with ordinary links. It picks the file whose name says *lunch* (not *breakfast*) and names a month, for example `NovemberLUNCH2026docx.pdf`.
- **Getting a picture.** Finalsite serves the original PDF at `…/images/v<version>/…/File.pdf`. With `f_auto,q_auto/` in front of the version, and an `Accept: image/png` header, it serves a 1650 px PNG of page 1. The script uses that PNG, falls back to the PDF (rendered with PDF.js, loaded only when needed), and after that tries a page that links to the file.
- **Cutting boxes.** In a WebView canvas, `gridFind` finds the table's ruled lines (and the orange header band). `boxFor` maps each school day to its box, and `trimBox` crops it tight, dropping the date number on the first line. A box with only a date in it counts as "no lunch".
- **Re-uploads.** The file address includes Finalsite's version stamp, so if the school re-uploads a corrected menu, the widget offers to load it again.
- **Typed-in months.** Days in `MENU` at the top of the script are shown as text and take priority over the school's file. November 2026 is typed in. Later months come from the school's file automatically.

### Tests (on a computer, not the phone)

```bash
npm install
```

```bash
npm test
```

The tests load code straight out of `hellgate-lunch.js` and run it against saved copies of the school's real page and November 2026 menu (`test/fixtures/`, fetched Nov 9, 2026). They cover finding the menu, picking the day, and cutting boxes. The cut-out day pictures are written to `test/out/` so you can look at them.

To rebuild the website's menu data by hand (`--force` re-cuts months that are already cut):

```bash
node menu/build.mjs
```

To preview the website, serve `web/` with any static server, for example:

```bash
python -m http.server 8788 --directory web
```

To check the phone's canvas/PDF.js step in a browser:

```bash
node test/webview-server.mjs
```

Then open `http://localhost:8787/` (it processes the PNG, a 2200 px JPEG, and the PDF) or `http://localhost:8787/week?now=2026-11-23T15:00` (the week screen with every day drawn from cut-out pictures).
