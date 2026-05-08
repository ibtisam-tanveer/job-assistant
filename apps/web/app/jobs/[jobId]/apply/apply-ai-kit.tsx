"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AtsReport, Job } from "@/lib/api";
import { getApiBase } from "@/lib/api";

type Props = { job: Job };

function formatApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Request failed";
  const d = (payload as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
    return String((d[0] as { msg?: string }).msg ?? "Request failed");
  }
  return "Request failed";
}

export function ApplyAiKit({ job }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(job.profile_text ?? "");
  const [resume, setResume] = useState(job.tailored_resume_text ?? "");
  const [letter, setLetter] = useState(job.cover_letter_text ?? "");
  const [ats, setAts] = useState<AtsReport | null>(job.ats_report ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${getApiBase()}/jobs/${job.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_text: profile,
          parts: ["resume", "cover_letter", "ats"],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(formatApiError(data));
        return;
      }
      const j = data as Job;
      setProfile(j.profile_text ?? profile);
      setResume(j.tailored_resume_text ?? "");
      setLetter(j.cover_letter_text ?? "");
      setAts(j.ats_report ?? null);
      setMessage("Generated and saved. You can refresh the page anytime.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const cardStyle = {
    marginTop: "1.5rem",
    padding: "1.25rem",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    background: "#f8fafc",
  } as const;

  return (
    <section style={cardStyle}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Tailored documents & ATS</h2>
      <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#475569", lineHeight: 1.5 }}>
        Paste your master resume or career summary below. The API uses OpenAI to draft a tailored
        resume, a cover letter, and a simple ATS-style keyword report. Requires{" "}
        <code style={{ fontSize: "0.85em" }}>OPENAI_API_KEY</code> in{" "}
        <code style={{ fontSize: "0.85em" }}>services/api/.env</code> and a captured job
        description.
      </p>
      <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600 }}>
        Your background / master resume
        <textarea
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          rows={8}
          placeholder="Paste bullets: roles, stack, impact metrics, education…"
          style={{
            display: "block",
            marginTop: "0.35rem",
            width: "100%",
            padding: "0.5rem",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            fontFamily: "inherit",
            fontSize: "0.9rem",
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          border: "none",
          background: "#0f172a",
          color: "#fff",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Generating (may take 30–60s)…" : "Generate resume, cover letter & ATS report"}
      </button>
      {message ? (
        <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#334155" }}>{message}</p>
      ) : null}

      {resume ? (
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Tailored resume</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: "0.88rem",
              lineHeight: 1.5,
              margin: 0,
              padding: "1rem",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              maxHeight: "22rem",
              overflow: "auto",
            }}
          >
            {resume}
          </pre>
        </div>
      ) : null}

      {letter ? (
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Cover letter</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: "0.88rem",
              lineHeight: 1.5,
              margin: 0,
              padding: "1rem",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              maxHeight: "18rem",
              overflow: "auto",
            }}
          >
            {letter}
          </pre>
        </div>
      ) : null}

      {ats && typeof ats.keyword_coverage_percent === "number" ? (
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>ATS-style check</h3>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
            Estimated keyword coverage:{" "}
            <strong>{ats.keyword_coverage_percent}%</strong>
          </p>
          {ats.matched_keywords && ats.matched_keywords.length > 0 ? (
            <p style={{ fontSize: "0.88rem", color: "#166534", margin: "0.25rem 0" }}>
              <strong>Matched:</strong> {ats.matched_keywords.join(", ")}
            </p>
          ) : null}
          {ats.missing_keywords && ats.missing_keywords.length > 0 ? (
            <p style={{ fontSize: "0.88rem", color: "#991b1b", margin: "0.25rem 0" }}>
              <strong>Weak / missing:</strong> {ats.missing_keywords.join(", ")}
            </p>
          ) : null}
          {ats.suggestions && ats.suggestions.length > 0 ? (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.88rem" }}>
              {ats.suggestions.map((s, i) => (
                <li key={i} style={{ marginBottom: "0.25rem" }}>
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
