import Link from "next/link";
import { fetchJobs } from "@/lib/api";

export default async function HomePage() {
  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];
  let error: string | null = null;
  try {
    jobs = await fetchJobs();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the API.";
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem" }}>Job inbox</h1>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
          Jobs appear here after you ingest them from the Chrome extension or other clients. API:{" "}
          <code style={{ fontSize: "0.9em" }}>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}</code>
        </p>
      </header>

      {error ? (
        <div
          style={{
            padding: "1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
          }}
        >
          <strong>API unavailable.</strong> {error} Start MongoDB and FastAPI (see repo README).
        </div>
      ) : jobs.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          No jobs yet. Open a LinkedIn job and use the extension to send it here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {jobs.map((job) => (
            <li
              key={job.id}
              style={{
                borderBottom: "1px solid #e2e8f0",
                padding: "1rem 0",
              }}
            >
              <Link
                href={`/jobs/${job.id}/apply`}
                style={{
                  fontWeight: 600,
                  color: "#0f172a",
                  textDecoration: "none",
                }}
              >
                {job.title}
              </Link>
              <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: "0.25rem" }}>
                {[job.company, job.location, job.application_status].filter(Boolean).join(" · ")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
