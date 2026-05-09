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
      setMessage("Done — outputs are saved on this job.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ja-card">
      <h2 className="ja-section-title">AI application kit</h2>
      <p className="ja-hint" style={{ marginTop: "-0.25rem", marginBottom: "1.1rem" }}>
        Paste your master resume or bullet summary. Requires{" "}
        <span className="ja-code">OPENAI_API_KEY</span> in the API{" "}
        <span className="ja-code">.env</span> and a captured job description above.
      </p>
      <div className="ja-field">
        <label className="ja-label" htmlFor="ja-profile">
          Your background
        </label>
        <textarea
          id="ja-profile"
          className="ja-textarea"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          rows={8}
          placeholder="Roles, stack, metrics, education — be specific so outputs stay truthful."
        />
      </div>
      <button
        type="button"
        className="ja-btn ja-btn--primary"
        onClick={() => void generate()}
        disabled={busy}
      >
        {busy ? "Generating… (often 30–60s)" : "Generate resume, letter & ATS check"}
      </button>
      {message ? (
        message.startsWith("Done") ? (
          <div className="ja-alert ja-alert--success" style={{ marginTop: "1rem" }}>
            {message}
          </div>
        ) : (
          <p className="ja-message">{message}</p>
        )
      ) : null}

      {resume ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <h3 className="ja-section-title">Tailored resume</h3>
          <pre className="ja-prose">{resume}</pre>
        </div>
      ) : null}

      {letter ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <h3 className="ja-section-title">Cover letter</h3>
          <pre className="ja-prose" style={{ maxHeight: "18rem" }}>
            {letter}
          </pre>
        </div>
      ) : null}

      {ats && typeof ats.keyword_coverage_percent === "number" ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <h3 className="ja-section-title">ATS-style check</h3>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div className="ja-ats-score">{ats.keyword_coverage_percent}%</div>
              <div className="ja-ats-label">estimated keyword overlap</div>
            </div>
          </div>
          {ats.matched_keywords && ats.matched_keywords.length > 0 ? (
            <div style={{ marginTop: "0.85rem" }}>
              <span className="ja-label" style={{ marginBottom: "0.35rem" }}>
                Strong matches
              </span>
              <div className="ja-chip-list">
                {ats.matched_keywords.map((k) => (
                  <span key={k} className="ja-chip ja-chip--ok">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {ats.missing_keywords && ats.missing_keywords.length > 0 ? (
            <div style={{ marginTop: "0.85rem" }}>
              <span className="ja-label" style={{ marginBottom: "0.35rem" }}>
                Gaps to consider
              </span>
              <div className="ja-chip-list">
                {ats.missing_keywords.map((k) => (
                  <span key={k} className="ja-chip ja-chip--miss">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {ats.suggestions && ats.suggestions.length > 0 ? (
            <ul className="ja-list-tight">
              {ats.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
