const apiUrl = document.getElementById("apiUrl");
const secret = document.getElementById("secret");
const webUrl = document.getElementById("webUrl");
const statusEl = document.getElementById("status");

async function load() {
  const s = await chrome.storage.sync.get(["apiBaseUrl", "ingestSecret", "webBaseUrl"]);
  apiUrl.value = s.apiBaseUrl || "http://localhost:8000";
  secret.value = s.ingestSecret || "";
  webUrl.value = s.webBaseUrl || "http://localhost:3000";
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBaseUrl: apiUrl.value.replace(/\/$/, ""),
    ingestSecret: secret.value,
    webBaseUrl: webUrl.value.replace(/\/$/, ""),
  });
  statusEl.textContent = "Saved.";
});

document.getElementById("send").addEventListener("click", async () => {
  statusEl.textContent = "Ingest not wired yet — implement /ingest/job in FastAPI.";
});

load();
