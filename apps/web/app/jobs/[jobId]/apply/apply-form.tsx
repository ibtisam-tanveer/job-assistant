"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Job } from "@/lib/api";
import { getApiBase } from "@/lib/api";

const STATUSES = [
  "saved",
  "applied",
  "phone",
  "onsite",
  "offer",
  "rejected",
] as const;

type Props = { job: Job };

export function ApplyForm({ job }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(job.application_status);
  const [notes, setNotes] = useState(job.notes);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${getApiBase()}/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_status: status, notes }),
      });
      if (!res.ok) {
        setMessage(`Save failed (${res.status})`);
        return;
      }
      setMessage("Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ja-card ja-card--muted">
      <h2 className="ja-section-title">Tracker</h2>
      <p className="ja-hint" style={{ marginTop: "-0.25rem", marginBottom: "1rem" }}>
        Status and notes sync to your database.
      </p>
      <div className="ja-field">
        <label className="ja-label" htmlFor="ja-status">
          Status
        </label>
        <select
          id="ja-status"
          className="ja-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="ja-field">
        <label className="ja-label" htmlFor="ja-notes">
          Notes
        </label>
        <textarea
          id="ja-notes"
          className="ja-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Recruiter name, follow-ups, interview dates…"
        />
      </div>
      <button
        type="button"
        className="ja-btn ja-btn--primary"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
      {message ? <p className="ja-message">{message}</p> : null}
    </section>
  );
}
