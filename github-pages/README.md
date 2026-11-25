# What the old address serves

Hawks Lunch moved to https://hawkslunch.netlify.app. The GitHub Action publishes this folder to
https://hellgatelunch.github.io instead of `web/`:

- Every page (/, /google/, /flyer.html, anything else) forwards to the same page on Netlify.
- `sw.js` clears the old app's saved copy on phones and removes itself, so installed copies load the forward.
- `data/` (menu.json, day pictures) and `calendar.ics` are copies from `web/` as of the last run. The
  Action stopped running on its own on 2026-11-24, so these no longer update: old iPhone widgets and
  calendar subscriptions on this address need to switch to hawkslunch.netlify.app.
