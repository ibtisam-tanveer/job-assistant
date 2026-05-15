import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchJob } from "@/lib/api-server";
import { ApplyHeroStatus } from "./apply-hero-status";
import { ApplyTabs } from "./apply-tabs";

type Props = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function parseTab(raw: string | undefined): "posting" | "tracker" | "ai" {
  if (raw === "tracker" || raw === "ai" || raw === "posting") return raw;
  return "posting";
}

export default async function ApplyPage(props: Props) {
  const { jobId } = await props.params;
  const { tab: tabRaw } = await props.searchParams;
  const initialTab = parseTab(tabRaw);

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
        <div className="ja-hero-actions ja-hero-actions--row">
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="ja-link"
          >
            View original posting ↗
          </a>
          <ApplyHeroStatus job={job} />
        </div>
      </header>

      <ApplyTabs
        job={job}
        descriptionText={job.description_text}
        jdSections={job.jd_sections}
        initialTab={initialTab}
        aiKitKey={`${job.id}-${job.updated_at}`}
      />
    </div>
  );
}
