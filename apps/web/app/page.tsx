import Link from "next/link";
import { Suspense } from "react";
import { GoogleConnectedBanner } from "./components/GoogleConnectedBanner";
import { InboxToolbar } from "./components/InboxToolbar";
import { fetchJobs } from "@/lib/api-server";

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

type Props = {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
};

export default async function HomePage(props: Props) {
  const sp = await props.searchParams;
  const q = sp.q?.trim() || undefined;
  const status = sp.status?.trim() || undefined;
  const sort =
    sp.sort === "title" || sp.sort === "company" ? sp.sort : ("updated" as const);

  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];
  let error: string | null = null;
  try {
    jobs = await fetchJobs({ q, status, sort });
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
      <p className="ja-hint" style={{ marginBottom: "1rem" }}>
        API <span className="ja-code">{apiUrl}</span>
        {!error && jobs.length > 0 ? (
          <>
            {" "}
            · <strong style={{ color: "var(--text-secondary)" }}>{jobs.length}</strong>{" "}
            {jobs.length === 1 ? "role" : "roles"}
          </>
        ) : null}
      </p>

      <Suspense fallback={null}>
        <GoogleConnectedBanner />
        <InboxToolbar />
      </Suspense>

      {error ? (
        <div className="ja-alert ja-alert--error" role="alert">
          <strong>API unavailable.</strong> {error} Start MongoDB and FastAPI (see README).
          <p className="ja-hint" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            First time? Copy <span className="ja-code">services/api/.env.example</span> to{" "}
            <span className="ja-code">.env</span> and run{" "}
            <span className="ja-code">scripts/dev-local.sh</span>.
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="ja-empty">
          <strong style={{ color: "var(--text)" }}>No jobs yet.</strong>
          <br />
          {q || status ? (
            <>No matches for your filters. Try clearing search or status.</>
          ) : (
            <>
              Open a LinkedIn posting and use the extension to send it here, or run discovery when
              configured.
            </>
          )}
        </div>
      ) : (
        <ul className="ja-job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/jobs/${job.id}/apply`} className="ja-job-row">
                <p className="ja-job-row-title">{job.title}</p>
                <div className="ja-job-row-meta">
                  <span className="ja-job-row-meta-text">
                    {[job.company, job.location].filter(Boolean).join(" · ") || "—"}
                  </span>{" "}
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
