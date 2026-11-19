# What the old address serves

Hawks Lunch moved to https://hawkslunch.netlify.app. The GitHub Action publishes this folder to
https://hellgatelunch.github.io instead of `web/`:

- Every page (/, /google/, /flyer.html, anything else) forwards to the same page on Netlify.
- `sw.js` clears the old app's saved copy on phones and removes itself, so installed copies load the forward.
- `data/` (menu.json, day pictures) and `calendar.ics` are still copied in from `web/` and kept up to date
  every 6 hours, because existing iPhone widgets and calendar subscriptions read them from this address
  and those can't be forwarded.
