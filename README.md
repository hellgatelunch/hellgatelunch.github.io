# Hellgate Lunch

Breakfast, middle school Breakfast @ Break and lunch at Hellgate Elementary K-8 (Hawks), straight from the school's own monthly menus.

- **The website: <https://hellgatelunch.github.io/>.** Open it on any phone or computer. On iPhone, tap Share → *Add to Home Screen*; on Android, tap *Install*. It opens like an app and works offline. No setup.
- **Your phone's calendar.** On the website, *Get it in your calendar* adds each school day's lunch to your calendar (and its widgets).
- **The iPhone widget** (below). A home-screen widget with the next school day's breakfast and lunch.

To spread the word, use the [printable flyer with a QR code](https://hellgatelunch.github.io/flyer.html) (not linked from the app itself).

## The iPhone widget

A home-screen widget that shows the next school day's **breakfast and lunch**. Tap it to open the full week on the website.

- Before 2 PM it shows today. After 2 PM it switches to the next school day, skipping weekends and days off.
- New months appear on their own when the school posts them. There's nothing to tap or reload.
- It keeps the last menu on the phone, so it still works without a connection.
- Small or medium size. The medium size also shows the sides.

It runs in **Scriptable**, a free app that lets you make your own widgets. You set it up once.

### Set it up (about 5 minutes)

#### 1. Install Scriptable
Get **Scriptable** (by Simon B. Støvring) from the App Store. It's free.

#### 2. Add the script
1. Open Scriptable and tap **+** in the top-right corner.
2. Tap the title at the top ("Untitled Script") and rename it **Hellgate Lunch**.
3. Copy all of the code in [`hellgate-lunch.js`](hellgate-lunch.js), from `// Hellgate Lunch` to the last line, and paste it into the script. **If you have the old version, replace all of it.**
4. Tap **Done**.
5. To check it, tap the script once in Scriptable. A preview of the widget opens. Close it when you're done looking.

#### 3. Put the widget on your home screen
1. Long-press an empty spot on the home screen until the apps jiggle.
2. Tap **Edit** in the top-left corner, then **Add Widget**. On older iOS versions, tap **+** instead.
3. Search for **Scriptable**, pick the small square (or the medium) size, and tap **Add Widget**.
4. While the apps are still jiggling, tap the new widget. If it doesn't open its settings, long-press it and choose **Edit Widget**.
5. Set:
   - **Script:** Hellgate Lunch
   - **When Interacting:** Open URL, with the URL `https://hellgatelunch.github.io/`
   - **Parameter:** leave empty for breakfast and lunch. Or type `lunch`, `breakfast`, `all` (adds the middle school break), or a mix like `breakfast, break`.
6. Tap outside the panel, then tap **Done**.

The widget fills in within a few seconds.

**Updating from the old widget** (the one that said "Tap to load the December menu"): replace the script's code as in step 2.3, then long-press the widget › **Edit Widget** and change **When Interacting** to **Open URL** as above. The old widget's saved pictures are cleaned up on its own.

## Calendar

On the website, **Get it in your calendar**:

- **iPhone:** tap **iPhone**, then **Subscribe**.
- **Android / Google:** Google only lets you add a calendar from a computer.
  1. On a computer signed in to Google, go to **hellgatelunch.github.io/google** and click **Add**.
  2. On the Android phone, open **Google Calendar** › **Settings** › **Hellgate Lunch** and turn on **Sync**. New calendars often start with sync off.
- **Samsung Calendar, Outlook, others:** add `https://hellgatelunch.github.io/calendar.ics` as a subscribed calendar ("from URL").

Each school day gets an all-day event titled with lunch ("Lunch: Cheeseburger"), with breakfast, break and lunch in the notes. Days off get no event. It refreshes on its own.

---

## How it works (for whoever maintains this)

`web/` is a static site published with GitHub Pages. A GitHub Action (`.github/workflows/menu.yml`) runs every 6 hours:

1. `menu/build.mjs` reads the school's menu page and finds the monthly **lunch** and **breakfast** PDFs.
2. For each new month, it finds the calendar's day boxes (grid code in `lib/school-menu.js`) and reads the words in each box from the PDF's text layer (`menu/pdf-text.mjs`, pdf.js).
3. It writes `web/data/menu.json` (the one menu file the website and the widget read) and `web/calendar.ics` (`menu/calendar.mjs`).
4. It commits anything that changed and republishes the site.

Details:

- **Finding the menu.** The school's page (Finalsite) doesn't link to the menus. It shows each PDF as an `<img>` with an empty `src`, with the file's addresses URL-encoded in `data-image-sizes`. `lib/school-menu.js` reads those and picks files by name and month (`NovemberLUNCH2026docx.pdf`, `November2026BREAKFASTdocx.pdf`).
- **Getting a picture of the page.** Finalsite serves the original PDF at `…/images/v<version>/…/File.pdf`. With `f_auto,q_auto/` before the version and `Accept: image/png`, it serves a 1650 px PNG of page 1, which is used to find the grid.
- **Re-uploads.** The file address includes Finalsite's version stamp, so a corrected re-upload gets read again.
- **Scanned menus.** If a menu's words can't be read, that day falls back to a see-through picture of the school's box, drawn in the text color. The Action logs a notice.
- **Breakfast @ Break** isn't a monthly calendar: the school posts one sheet for the year, with two weekly menus that alternate by month. It's typed into `menu/break.json`. If the school posts a different sheet, the Action warns and the site links to the new one; update `menu/break.json` from it (including its `source`).
- **Typed-in days.** `MENU` at the top of `lib/school-menu.js` holds November 2026 lunch, typed in. Those days take priority and double as a test: the words read from the PDF must match them.

The website:

- Before 2 PM (Montana time) the top card shows today's meals; after 2 PM, the next school day. Below it is the week, with arrows (or ← →) to flip weeks.
- Colors are Hawks green `#29610B` and gold `#FCD52D`. Each meal has one color and icon everywhere: gold with bacon and eggs for breakfast, slate blue with an apple for Breakfast @ Break, green with a fork and knife for lunch. The meal toggles are equal tiles: food icon on top, meal name below.
- The meal toggles (Breakfast / Break / Lunch tiles) hide meals a family doesn't need. **Pack or buy?**: the heart and thumbs-down mark foods a kid likes or not, saved separately for each meal; disliked lunches show "Maybe pack a lunch". Both are stored only in that phone's browser (the app asks the browser to keep them).
- `web/sw.js` (service worker) keeps the last menu so the app opens offline. Bump its `VERSION` when the app's own files change.
- Logo and icons: `node tools/make-logo.mjs assets/hawks-logo-source.png`, then `node tools/make-icons.mjs`. QR code: `node tools/make-qr.mjs`.
- To force a refresh: the repository's **Actions** tab → *Refresh menu and publish site* → **Run workflow**. If a run fails on GitHub's side ("artifact not found"), start a new run that way rather than re-running the failed one.
- GitHub pauses scheduled Actions after 60 days without activity. Menu updates commit to the repository, so this shouldn't happen during the school year. After summer break, re-enable it from the Actions tab if needed.

Preview switches: `?now=2026-11-24T15:00` pretends it's another time; `?pictures` ignores the typed-in days.

### Tests (on a computer, not the phone)

```bash
npm install
```

```bash
npm test
```

The tests run against saved copies of the school's real page and November 2026 menus (`test/fixtures/`). They cover finding the menus, cutting the grid, reading the words, the calendar feed, and the iPhone widget. The widget is run start to finish in a stand-in for Scriptable, to check what it draws and that it works offline.

To rebuild the menu data by hand (`--force` re-reads months that are already done):

```bash
node menu/build.mjs
```

To preview the website:

```bash
python -m http.server 8788 --directory web
```
