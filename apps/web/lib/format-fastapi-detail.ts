export function formatFastApiDetail(payload: unknown, status?: number): string {
  if (!payload || typeof payload !== "object") {
    return status ? `Request failed (${status})` : "Request failed";
  }
  const d = (payload as { detail?: unknown }).detail;
  if (typeof d === "string") {
    let msg = d;
    if (
      status === 401 &&
      /token|missing|invalid|unauthorized/i.test(msg)
    ) {
      msg +=
        " Set JOB_API_SECRET or WEB_API_SECRET in apps/web/.env.local to match WEB_API_SECRET in services/api/.env.";
    }
    return msg;
  }
  if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
    return String((d[0] as { msg?: string }).msg ?? "Request failed");
  }
  return status ? `Request failed (${status})` : "Request failed";
}
