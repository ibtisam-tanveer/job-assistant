# LinkedIn extension

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extensions/linkedin`).
3. Click the extension icon → set **API base URL** (e.g. `http://localhost:8000`), **ingest secret** (same value as `INGEST_SECRET` in `services/api/.env`), and **web app URL** (e.g. `http://localhost:3000`) → **Save**.
4. Open a **LinkedIn job** detail page and click **Send current LinkedIn job**. The active tab is scraped, the job is `POST`ed to `/ingest/job`, and a new tab opens your apply screen.

LinkedIn’s DOM changes often. After updating `popup.js`, open **chrome://extensions** → **Reload** on Job Assistant. If capture still fails, check the console on the job tab; title fallbacks include `og:title`, `document.title`, JSON-LD `JobPosting`, and top-card `h1` selectors (`scrapeLinkedInJobPageInPage` in `popup.js`).
