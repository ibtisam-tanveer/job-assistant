"use client";

import { useCallback, useState } from "react";
import type { JdSections, Job } from "@/lib/api";
import { ApplyAiKit } from "./apply-ai-kit";
import { ApplyForm } from "./apply-form";

type TabId = "posting" | "tracker" | "ai";

type Props = {
  job: Job;
  descriptionText: string | null;
  jdSections?: JdSections | null;
  initialTab?: TabId;
  aiKitKey: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "posting", label: "Posting" },
  { id: "tracker", label: "Tracker" },
  { id: "ai", label: "AI kit" },
];

function tabBadge(job: Job, id: TabId): string | null {
  if (id === "posting") {
    return (job.description_text || "").trim().length > 80 ? "JD" : "!";
  }
  if (id === "tracker") {
    if (job.application_status !== "saved") return job.application_status;
    return job.notes?.trim() ? "•" : null;
  }
  if (job.tailored_resume_text || job.cover_letter_text) return "✓";
  if (job.uploaded_resume_text?.trim() || job.profile_text?.trim()) return "CV";
  return null;
}

export function ApplyTabs({
  job,
  descriptionText,
  jdSections,
  initialTab = "posting",
  aiKitKey,
}: Props) {
  const prefix = `job-${job.id}`;
  const elId = (suffix: string) => `${prefix}-${suffix}`;
  const [tab, setTab] = useState<TabId>(initialTab);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? (index + 1) % TABS.length
          : (index - 1 + TABS.length) % TABS.length;
      setTab(TABS[next].id);
      document.getElementById(`${prefix}-tab-${TABS[next].id}`)?.focus();
    },
    [prefix],
  );

  const sections = jdSections?.sections ?? [];

  return (
    <div className="ja-tabs">
      <div className="ja-tabs-list" role="tablist" aria-label="Application sections">
        {TABS.map(({ id, label }, i) => {
          const selected = tab === id;
          const badge = tabBadge(job, id);
          return (
            <button
              key={id}
              type="button"
              id={elId(`tab-${id}`)}
              role="tab"
              aria-selected={selected}
              aria-controls={elId(`panel-${id}`)}
              tabIndex={0}
              className="ja-tab"
              data-active={selected ? "true" : undefined}
              onClick={() => setTab(id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {label}
              {badge ? <span className="ja-tab-badge">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      <div
        id={elId("panel-posting")}
        role="tabpanel"
        aria-labelledby={elId("tab-posting")}
        hidden={tab !== "posting"}
        className="ja-tabs-panel"
      >
        {descriptionText ? (
          <section className="ja-card">
            <h2 className="ja-section-title">Job description</h2>
            {sections.length > 0 ? (
              <div className="ja-jd-sections">
                {sections.map((sec) => (
                  <details key={sec.id} className="ja-jd-section" open={sections.length <= 3}>
                    <summary className="ja-jd-section-title">{sec.title}</summary>
                    <pre className="ja-prose ja-prose--section">{sec.body}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <pre className="ja-prose ja-prose--tab">{descriptionText}</pre>
            )}
          </section>
        ) : (
          <div className="ja-alert ja-alert--warn">
            No description on file. Re-send from the LinkedIn tab with the extension to capture the
            full posting.
          </div>
        )}
      </div>

      <div
        id={elId("panel-tracker")}
        role="tabpanel"
        aria-labelledby={elId("tab-tracker")}
        hidden={tab !== "tracker"}
        className="ja-tabs-panel"
      >
        <ApplyForm job={job} />
      </div>

      <div
        id={elId("panel-ai")}
        role="tabpanel"
        aria-labelledby={elId("tab-ai")}
        hidden={tab !== "ai"}
        className="ja-tabs-panel"
      >
        <ApplyAiKit key={aiKitKey} job={job} />
      </div>
    </div>
  );
}
