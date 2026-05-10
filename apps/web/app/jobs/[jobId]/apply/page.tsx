import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchJob } from "@/lib/api";
import { ApplyTabs } from "./apply-tabs";

type Props = { params: Promise<{ jobId: string }> };

export default async function ApplyPage(props: Props) {
  const { jobId } = await props.params;
  const job = await fetchJob(jobId);
  if (!job) notFound();

  return (
    <div className="ja-main ja-main--wide">
      <Link href="/" className="ja-back">
        <span aria-hidden>←</span> Back to inbox
      </Link>

      <header className="ja-hero">
        <p className="ja-kicker">Application</p>
        <h1 className="ja-title">{job.title}</h1>
        <p className="ja-subtitle">
          {[job.company, job.location].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="ja-hero-actions">
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="ja-link"
          >
            View original posting ↗
          </a>
        </div>
      </header>

      <ApplyTabs
        job={job}
        descriptionText={job.description_text}
        aiKitKey={`${job.id}-${job.updated_at}`}
      />
    </div>
  );
}
