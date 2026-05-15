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

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ApplyForm({ job }: Props) {
  const [status, setStatus] = useState(job.application_status);
  const [notes, setNotes] = useState(job.notes);
  const [appliedAt, setAppliedAt] = useState(toDatetimeLocal(job.applied_at));
  const [interviewAt, setInterviewAt] = useState(toDatetimeLocal(job.interview_at));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await patchJobAction(job.id, {
        application_status: status,
        notes,
        applied_at: fromDatetimeLocal(appliedAt),
        interview_at: fromDatetimeLocal(interviewAt),
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const j = result.job;
      setStatus(j.application_status);
      setNotes(j.notes);
      setAppliedAt(toDatetimeLocal(j.applied_at));
      setInterviewAt(toDatetimeLocal(j.interview_at));
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ja-card ja-card--muted">
      <h2 className="ja-section-title">Tracker</h2>
      <p className="ja-hint" style={{ marginTop: "-0.25rem", marginBottom: "1rem" }}>
        Status, dates, and notes sync to your database.
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
      <div className="ja-form-row">
        <div className="ja-field">
          <label className="ja-label" htmlFor="ja-applied-at">
            Applied date
          </label>
          <input
            id="ja-applied-at"
            type="datetime-local"
            className="ja-input"
            value={appliedAt}
            onChange={(e) => setAppliedAt(e.target.value)}
          />
        </div>
        <div className="ja-field">
          <label className="ja-label" htmlFor="ja-interview-at">
            Interview date
          </label>
          <input
            id="ja-interview-at"
            type="datetime-local"
            className="ja-input"
            value={interviewAt}
            onChange={(e) => setInterviewAt(e.target.value)}
          />
        </div>
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
