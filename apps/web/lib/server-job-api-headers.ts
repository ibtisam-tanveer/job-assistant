/**
 * Headers for server-side calls to FastAPI /jobs/*.
 * Accept either name so .env.local can mirror the API file (WEB_API_SECRET) or use JOB_API_SECRET.
 */
export function buildJobApiHeaders(opts?: { json?: boolean }): HeadersInit {
  const t =
    process.env.JOB_API_SECRET?.trim() ||
    process.env.WEB_API_SECRET?.trim();
  const h: Record<string, string> = {};
  if (opts?.json) h["Content-Type"] = "application/json";
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}
