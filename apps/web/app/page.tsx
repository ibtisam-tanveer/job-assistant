import Link from "next/link";
import { fetchJobs } from "@/lib/api";

function statusBadgeClass(status: string): string {
  const base = "ja-badge";
  const map: Record<string, string> = {
    saved: `${base} ja-badge--saved`,
    applied: `${base} ja-badge--applied`,
    phone: `${base} ja-badge--phone`,
    onsite: `${base} ja-badge--onsite`,
    offer: `${base} ja-badge--offer`,
    rejected: `${base} ja-badge--rejected`,
  };
  return map[status] ?? base;
}

export default async function HomePage() {
  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];
  let error: string | null = null;
  try {
    jobs = await fetchJobs();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the API.";
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return (
    <div className="ja-main">
      <p className="ja-kicker">Pipeline</p>
      <h1 className="ja-title">Inbox</h1>
      <p className="ja-subtitle" style={{ marginBottom: "0.35rem" }}>
        Saved roles from the Chrome extension and other sources.
      </p>
      <p className="ja-hint" style={{ marginBottom: "1.75rem" }}>
        API <span className="ja-code">{apiUrl}</span>
        {!error && jobs.length > 0 ? (
          <>
            {" "}
            · <strong style={{ color: "var(--text-secondary)" }}>{jobs.length}</strong>{" "}
            {jobs.length === 1 ? "role" : "roles"}
          </>
        ) : null}
      </p>

      {error ? (
        <div className="ja-alert ja-alert--error" role="alert">
          <strong>API unavailable.</strong> {error} Start MongoDB and FastAPI (see README).
        </div>
      ) : jobs.length === 0 ? (
        <div className="ja-empty">
          <strong style={{ color: "var(--text)" }}>No jobs yet.</strong>
          <br />
          Open a LinkedIn posting and use the extension to send it here.
        </div>
      ) : (
        <ul className="ja-job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/jobs/${job.id}/apply`} className="ja-job-row">
                <p className="ja-job-row-title">{job.title}</p>
                <div className="ja-job-row-meta">
                  {[job.company, job.location].filter(Boolean).join(" · ") || "—"}
                  <span className={statusBadgeClass(job.application_status)}>
                    {job.application_status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
