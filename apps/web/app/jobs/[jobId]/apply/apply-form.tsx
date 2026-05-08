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
    <div
      style={{
        marginTop: "1.5rem",
        padding: "1.25rem",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        background: "#f8fafc",
      }}
    >
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Application tracker</h2>
      <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600 }}>
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            display: "block",
            marginTop: "0.35rem",
            width: "100%",
            maxWidth: "16rem",
            padding: "0.5rem",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label
        style={{
          display: "block",
          fontSize: "0.875rem",
          fontWeight: 600,
          marginTop: "1rem",
        }}
      >
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          style={{
            display: "block",
            marginTop: "0.35rem",
            width: "100%",
            padding: "0.5rem",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontFamily: "inherit",
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          border: "none",
          background: "#0f172a",
          color: "#fff",
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {message ? (
        <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#334155" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
