# LinkedIn extension (skeleton)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extensions/linkedin`).
3. Click the extension icon → set **API base URL** (e.g. `http://localhost:8000`), **ingest secret**, and **web app URL** (e.g. `http://localhost:3000`) → **Save**.

**Next steps (implementation):**

- Add a content script for `linkedin.com/jobs/*` to scrape title, company, description.
- On **Send**, `POST` JSON to `{apiBaseUrl}/ingest/job` with `Authorization: Bearer {ingestSecret}`.
- On success, open `{webBaseUrl}/jobs/{jobId}/apply`.
