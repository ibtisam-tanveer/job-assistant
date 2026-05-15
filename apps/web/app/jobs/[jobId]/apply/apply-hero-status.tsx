"use client";

import { useState } from "react";
import type { Job } from "@/lib/api";
import { patchJobAction } from "./job-actions";

const STATUSES = [
  "saved",
  "applied",
  "phone",
  "onsite",
  "offer",
  "rejected",
] as const;

type Props = { job: Job };

export function ApplyHeroStatus({ job }: Props) {
  const [status, setStatus] = useState(job.application_status);
  const [busy, setBusy] = useState(false);

  async function onChange(next: string) {
    setStatus(next);
    setBusy(true);
    try {
      const result = await patchJobAction(job.id, { application_status: next });
      if (!result.ok) setStatus(job.application_status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ja-hero-status">
      <label className="ja-label" htmlFor="ja-hero-status">
        Pipeline status
      </label>
      <select
        id="ja-hero-status"
        className="ja-select ja-hero-status-select"
        value={status}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
