const apiUrl = document.getElementById("apiUrl");
const secret = document.getElementById("secret");
const webUrl = document.getElementById("webUrl");
const statusEl = document.getElementById("status");

/** @param {"neutral" | "busy" | "error" | "ok"} kind */
function setStatus(text, kind = "neutral") {
  statusEl.textContent = text;
  statusEl.classList.remove("ext-status--busy", "ext-status--error", "ext-status--ok");
  if (kind === "busy") statusEl.classList.add("ext-status--busy");
  if (kind === "error") statusEl.classList.add("ext-status--error");
  if (kind === "ok") statusEl.classList.add("ext-status--ok");
}

/** Must match INGEST_SECRET in services/api/.env for local dev. */
const LOCAL_DEV_INGEST = "jobassistant-local-dev-ingest";

function isLocalApiBase(url) {
  return /localhost|127\.0\.0\.1/.test(url || "");
}

function isPlaceholderIngest(value) {
  const t = (value || "").trim();
  return !t || /^ingest_secret$/i.test(t);
}

/** When API URL is local and secret is missing or wrong placeholder, use repo default. */
function effectiveIngestToken(raw) {
  const base = apiUrl.value || "";
  if (isLocalApiBase(base) && isPlaceholderIngest(raw)) return LOCAL_DEV_INGEST;
  return (raw || "").trim();
}

/**
 * Runs inside the LinkedIn tab (isolated world). Keep self-contained — Chrome serializes this.
 */
function scrapeLinkedInJobPageInPage() {
  const source_url = window.location.href;

  function pickText(selList) {
    for (const sel of selList) {
      const el = document.querySelector(sel);
      const t = el?.textContent?.replace(/\s+/g, " ")?.trim();
      if (t && t.length > 1 && t.length < 500) return t;
    }
    return "";
  }

  function jobIdFromUrl() {
    const m = source_url.match(/\/jobs\/view\/(\d+)/);
    if (m) return m[1];
    const q = source_url.match(/[?&]currentJobId=(\d+)/);
    if (q) return q[1];
    return null;
  }

  function fromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const node of scripts) {
      try {
        const raw = node.textContent?.trim();
        if (!raw) continue;
        const j = JSON.parse(raw);
        const list = Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const type = item["@type"];
          const types = Array.isArray(type) ? type : type ? [type] : [];
          if (!types.includes("JobPosting")) continue;
          const title = item.title;
          if (!title || typeof title !== "string") continue;
          const org = item.hiringOrganization;
          const company =
            typeof org === "string"
              ? org
              : org && typeof org === "object"
                ? org.name
                : null;
          const loc = item.jobLocation;
          let location = null;
          if (loc && typeof loc === "object") {
            const addr = loc.address;
            if (addr && typeof addr === "object") {
              location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .filter(Boolean)
                .join(", ");
            }
          }
          const desc =
            typeof item.description === "string" ? item.description.trim() : null;
          return {
            title: title.trim(),
            company: company ? String(company).trim() : null,
            location,
            description_text: desc,
          };
        }
      } catch (_) {
        /* next script */
      }
    }
    return null;
  }

  const ld = fromJsonLd();

  const title =
    ld?.title ||
    pickText([
      ".jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title",
      "h1.t-24",
      "h1[class*='job-title']",
      '[data-test-id="job-title"]',
      ".jobs-details-top-card__job-title",
      "main h1",
      "h1",
    ]);

  const company =
    ld?.company ||
    pickText([
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      '[data-test-id="job-poster"]',
      "a[data-tracking-control-name='public_jobs_topcard-org-name']",
    ]) ||
    null;

  const location =
    ld?.location ||
    pickText([
      ".jobs-unified-top-card__bullet",
      ".job-details-jobs-unified-top-card__bullet",
      '[data-test-id="job-location"]',
      ".jobs-details-top-card__primary-description-container .tvm__text",
    ]) ||
    null;

  function scrapeDescriptionFromDom() {
    const selectors = [
      ".jobs-description-content__text",
      ".jobs-description__text",
      ".jobs-description__content",
      ".jobs-description-content",
      "[data-test-id='job-detail-text']",
      ".jobs-box__html-content",
      ".feed-shared-inline-show-more-text",
      "#job-details",
      "article.jobs-description",
      ".jobs-details__main-content",
      ".job-details-about-the-job-module",
      "[class*='jobs-description-content']",
      "[class*='job-details-about']",
    ];
    let best = "";
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const raw = el?.innerText || el?.textContent;
      const t = raw?.replace(/\s+/g, " ").trim() || "";
      if (t.length > best.length) best = t;
    }
    if (best.length > 40) return best;
    const vague = document.querySelector('[class*="jobs-description"]');
    const vraw = vague?.innerText || vague?.textContent;
    const vt = vraw?.replace(/\s+/g, " ").trim() || "";
    return vt.length > 40 ? vt : best || null;
  }

  const ldDesc = (ld?.description_text || "").trim();
  const domDesc = scrapeDescriptionFromDom();
  const description_text =
    (ldDesc.length > 0 ? ldDesc : null) || (domDesc && domDesc.length > 0 ? domDesc : null);

  const external_id = jobIdFromUrl();

  if (!title) {
    return {
      error:
        "Could not read job title. Open a full job posting (not only search results), then try again.",
    };
  }

  return {
    source_url,
    title,
    company: company || null,
    location: location || null,
    description_text: description_text || null,
    external_id,
  };
}

async function load() {
  const s = await chrome.storage.sync.get(["apiBaseUrl", "ingestSecret", "webBaseUrl"]);
  let api = (s.apiBaseUrl || "http://localhost:8000").replace(/\/$/, "");
  let web = (s.webBaseUrl || "http://localhost:3000").replace(/\/$/, "");
  let sec = (s.ingestSecret || "").trim();

  if (isLocalApiBase(api) && isPlaceholderIngest(sec)) {
    sec = LOCAL_DEV_INGEST;
    await chrome.storage.sync.set({
      apiBaseUrl: api,
      webBaseUrl: web,
      ingestSecret: sec,
    });
    setStatus("Using local dev ingest secret (see services/api/.env).", "ok");
  }

  apiUrl.value = api;
  secret.value = sec;
  webUrl.value = web;
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBaseUrl: apiUrl.value.replace(/\/$/, ""),
    ingestSecret: secret.value,
    webBaseUrl: webUrl.value.replace(/\/$/, ""),
  });
  setStatus("Saved.", "ok");
});

document.getElementById("send").addEventListener("click", async () => {
  setStatus("Working…", "busy");
  const base = apiUrl.value.replace(/\/$/, "");
  const web = webUrl.value.replace(/\/$/, "");
  const token = effectiveIngestToken(secret.value);

  if (isPlaceholderIngest(secret.value) && isLocalApiBase(base)) {
    secret.value = LOCAL_DEV_INGEST;
  }

  if (!token) {
    setStatus("Set ingest secret to the value of INGEST_SECRET in services/api/.env", "error");
    return;
  }

  // lastFocusedWindow = the browser window you were using (not the popup)
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    setStatus("No active tab.", "error");
    return;
  }
  if (!tab.url || !/linkedin\.com/i.test(tab.url)) {
    setStatus(
      "Active tab is not LinkedIn. Click the job tab first, then open this popup again.",
      "error",
    );
    return;
  }

  let injected;
  try {
    [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeLinkedInJobPageInPage,
    });
  } catch (e) {
    setStatus(
      (e && e.message) || "Could not read the page. Reload the job on LinkedIn and retry.",
      "error",
    );
    return;
  }

  const result = injected?.result;
  if (!result || result.error) {
    setStatus(result?.error || "Could not read this page.", "error");
    return;
  }

  const payload = {
    source: "linkedin",
    source_url: result.source_url,
    title: result.title,
    company: result.company,
    location: result.location,
    description_text: result.description_text,
    external_id: result.external_id,
  };

  let res;
  try {
    res = await fetch(`${base}/ingest/job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    setStatus(
      "Network error — is the API running? Try: " +
        base +
        "/health  (" +
        ((e && e.message) || "fetch failed") +
        ")",
      "error",
    );
    return;
  }

  if (!res.ok) {
    const t = await res.text();
    setStatus(`API error ${res.status}: ${t.slice(0, 200)}`, "error");
    return;
  }

  const data = await res.json();
  const path = data.apply_path || `/jobs/${data.job_id}/apply`;
  const openUrl = `${web}${path.startsWith("/") ? path : `/${path}`}`;
  await chrome.tabs.create({ url: openUrl });
  setStatus(
    data.deduplicated ? "Opened existing job (deduped)." : "Saved and opened.",
    "ok",
  );
});

load();
