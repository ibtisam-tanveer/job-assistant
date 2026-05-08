# LinkedIn extension

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extensions/linkedin`).
3. Click the extension icon → set **API base URL** (e.g. `http://localhost:8000`), **ingest secret** (same value as `INGEST_SECRET` in `services/api/.env`), and **web app URL** (e.g. `http://localhost:3000`) → **Save**.
4. Open a **LinkedIn job** detail page and click **Send current LinkedIn job**. The active tab is scraped, the job is `POST`ed to `/ingest/job`, and a new tab opens your apply screen.

LinkedIn’s DOM changes often; if capture fails, check the browser console on the job page and adjust selectors in `popup.js` (`scrapeLinkedInJobPage`).
