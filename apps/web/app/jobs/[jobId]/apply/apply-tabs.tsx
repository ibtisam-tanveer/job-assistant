"use client";

import { useCallback, useId, useState } from "react";
import type { Job } from "@/lib/api";
import { ApplyAiKit } from "./apply-ai-kit";
import { ApplyForm } from "./apply-form";

type TabId = "posting" | "tracker" | "ai";

type Props = {
  job: Job;
  descriptionText: string | null;
  /** Remount AI kit when job updates from server */
  aiKitKey: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "posting", label: "Posting" },
  { id: "tracker", label: "Tracker" },
  { id: "ai", label: "AI kit" },
];

export function ApplyTabs({ job, descriptionText, aiKitKey }: Props) {
  const baseId = useId();
  const [tab, setTab] = useState<TabId>("posting");

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? (index + 1) % TABS.length
          : (index - 1 + TABS.length) % TABS.length;
      setTab(TABS[next].id);
      const el = document.getElementById(`${baseId}-tab-${TABS[next].id}`);
      el?.focus();
    },
    [baseId],
  );

  return (
    <div className="ja-tabs">
      <div className="ja-tabs-list" role="tablist" aria-label="Application sections">
        {TABS.map(({ id, label }, i) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              id={`${baseId}-tab-${id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              className="ja-tab"
              data-active={selected ? "true" : undefined}
              onClick={() => setTab(id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel-posting`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-posting`}
        hidden={tab !== "posting"}
        className="ja-tabs-panel"
      >
        {descriptionText ? (
          <section className="ja-card">
            <h2 className="ja-section-title">Job description</h2>
            <pre className="ja-prose ja-prose--tab">{descriptionText}</pre>
          </section>
        ) : (
          <div className="ja-alert ja-alert--warn">
            No description on file. Re-send from the LinkedIn tab with the extension to capture the
            full posting.
          </div>
        )}
      </div>

      <div
        id={`${baseId}-panel-tracker`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-tracker`}
        hidden={tab !== "tracker"}
        className="ja-tabs-panel"
      >
        <ApplyForm job={job} />
      </div>

      <div
        id={`${baseId}-panel-ai`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-ai`}
        hidden={tab !== "ai"}
        className="ja-tabs-panel"
      >
        <ApplyAiKit key={aiKitKey} job={job} />
      </div>
    </div>
  );
}
