import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchJob } from "@/lib/api";
import { ApplyAiKit } from "./apply-ai-kit";
import { ApplyForm } from "./apply-form";

type Props = { params: Promise<{ jobId: string }> };

export default async function ApplyPage(props: Props) {
  const { jobId } = await props.params;
  const job = await fetchJob(jobId);
  if (!job) notFound();

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
      <p style={{ margin: "0 0 1rem" }}>
        <Link href="/" style={{ color: "#2563eb" }}>
          ← Inbox
        </Link>
      </p>
      <article>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.75rem" }}>{job.title}</h1>
        <p style={{ margin: 0, color: "#475569", fontSize: "1rem" }}>
          {[job.company, job.location].filter(Boolean).join(" · ") || "—"}
        </p>
        <p style={{ margin: "1rem 0 0" }}>
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#2563eb" }}
          >
            Open original posting
          </a>
        </p>
        {job.description_text ? (
          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Description</h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                margin: 0,
                padding: "1rem",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                maxHeight: "24rem",
                overflow: "auto",
              }}
            >
              {job.description_text}
            </pre>
          </section>
        ) : (
          <p style={{ marginTop: "1.5rem", color: "#64748b" }}>
            No description was captured. Re-send from the LinkedIn page with the extension if
            needed.
          </p>
        )}
        <ApplyForm job={job} />
        <ApplyAiKit key={`${job.id}-${job.updated_at}`} job={job} />
      </article>
    </main>
  );
}
