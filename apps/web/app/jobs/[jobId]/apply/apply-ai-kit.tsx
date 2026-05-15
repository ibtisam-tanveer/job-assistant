"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { TextActions } from "@/app/components/TextActions";
import type { AtsReport, GoogleAuthStatus, GoogleDocExportResult, Job, SkillFit } from "@/lib/api";
import { downloadTextFile } from "@/lib/client-download";
import { formatFastApiDetail } from "@/lib/format-fastapi-detail";
import { generateApplyAction, patchJobAction } from "./job-actions";
import { fetchMasterProfileAction, saveMasterProfileAction } from "./profile-actions";

type Props = { job: Job };
type SourceMode = "upload" | "paste";
type GenPart = "resume" | "cover_letter" | "ats" | "skill_fit";

const ACCEPT = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";
const PREVIEW_MAX = 2400;

function isJobResponse(data: unknown, jobId: string): data is Job {
  if (!data || typeof data !== "object") return false;
  const j = data as Record<string, unknown>;
  return typeof j.id === "string" && j.id === jobId;
}

function initialSourceMode(job: Job): SourceMode {
  if (job.uploaded_resume_text?.trim()) return "upload";
  if (job.profile_text?.trim()) return "paste";
  return "upload";
}

function previewExcerpt(text: string, max = PREVIEW_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function stepLabel(parts: GenPart[]): string {
  if (parts.length === 1) {
    const map: Record<GenPart, string> = {
      resume: "Tailoring resume…",
      cover_letter: "Writing cover letter…",
      ats: "Running ATS check…",
      skill_fit: "Analyzing skill fit…",
    };
    return map[parts[0]];
  }
  return "Generating documents…";
}

export function ApplyAiKit({ job }: Props) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceMode, setSourceMode] = useState<SourceMode>(() => initialSourceMode(job));
  const [profile, setProfile] = useState(job.profile_text ?? "");
  const [outputLanguage, setOutputLanguage] = useState<"en" | "de">(
    job.output_language === "de" ? "de" : "en",
  );
  const [resume, setResume] = useState(job.tailored_resume_text ?? "");
  const [letter, setLetter] = useState(job.cover_letter_text ?? "");
  const [ats, setAts] = useState<AtsReport | null>(job.ats_report ?? null);
  const [skillFit, setSkillFit] = useState<SkillFit | null>(job.skill_fit ?? null);
  const [uploadedPreview, setUploadedPreview] = useState(
    job.uploaded_resume_text?.trim() ?? "",
  );
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadFileSize, setUploadFileSize] = useState<number | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [regenerateHint, setRegenerateHint] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [genStep, setGenStep] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [profileSaveHint, setProfileSaveHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resumeDocUrl, setResumeDocUrl] = useState(job.google_resume_doc_url ?? null);
  const [letterDocUrl, setLetterDocUrl] = useState(job.google_letter_doc_url ?? null);

  const hasUploadedResume = uploadedPreview.length > 0;

  useEffect(() => {
    void fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then((d) => setGoogleAuth(d as GoogleAuthStatus))
      .catch(() => setGoogleAuth(null));
  }, []);

  const applyJobPatch = useCallback((j: Job) => {
    setProfile(j.profile_text ?? "");
    setOutputLanguage(j.output_language === "de" ? "de" : "en");
    setResume(j.tailored_resume_text ?? "");
    setLetter(j.cover_letter_text ?? "");
    setAts(j.ats_report ?? null);
    setSkillFit(j.skill_fit ?? null);
    const uploaded = j.uploaded_resume_text?.trim() ?? "";
    setUploadedPreview(uploaded);
    if (uploaded) setSourceMode("upload");
  }, []);

  useEffect(() => {
    if (sourceMode !== "paste") return;
    const baseline = job.profile_text ?? "";
    if (profile === baseline) return;
    const t = setTimeout(() => {
      void patchJobAction(job.id, { profile_text: profile }).then((r) => {
        if (r.ok) setProfileSaveHint("Draft saved");
        setTimeout(() => setProfileSaveHint(null), 2000);
      });
    }, 900);
    return () => clearTimeout(t);
  }, [profile, sourceMode, job.id, job.profile_text]);

  async function uploadFile(file: File) {
    setUploadBusy(true);
    setMessage(null);
    setUploadFileName(file.name);
    setUploadFileSize(file.size);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/jobs/${job.id}/resume`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(formatFastApiDetail(data, res.status));
        return;
      }
      if (isJobResponse(data, job.id)) {
        applyJobPatch(data);
        const text = data.uploaded_resume_text?.trim() ?? "";
        setUploadedPreview(text);
        if (!text) {
          setMessage("Upload saved, but no text could be extracted from this file.");
          return;
        }
      }
      setMessage("Resume uploaded — preview updated below.");
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Upload failed: ${err.message}`
          : "Upload failed (network). Is the dev server running?",
      );
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onLanguageChange(next: "en" | "de") {
    setOutputLanguage(next);
    const result = await patchJobAction(job.id, { output_language: next });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    applyJobPatch(result.job);
  }

  async function clearUploadedResume() {
    setUploadBusy(true);
    setMessage(null);
    try {
      const result = await patchJobAction(job.id, { uploaded_resume_text: "" });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      applyJobPatch(result.job);
      setUploadedPreview("");
      setUploadFileName(null);
      setUploadFileSize(null);
      setMessage("Removed uploaded resume.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function loadMasterProfile() {
    const p = await fetchMasterProfileAction();
    if (!p.text.trim()) {
      setMessage("No master profile saved yet. Paste text and use “Save as master profile”.");
      return;
    }
    setProfile(p.text);
    setSourceMode("paste");
    setMessage("Loaded master profile.");
  }

  async function saveMasterProfile() {
    const result = await saveMasterProfileAction(profile);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage("Master profile saved for all jobs.");
  }

  async function runGenerate(parts: GenPart[]) {
    setBusy(true);
    setGenStep(stepLabel(parts));
    setMessage(null);
    try {
      const result = await generateApplyAction(job.id, {
        profile_text: sourceMode === "paste" ? profile : profile.trim() || undefined,
        output_language: outputLanguage,
        parts,
        regenerate_instructions: regenerateHint.trim() || undefined,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      applyJobPatch(result.job);
      setMessage("Done — outputs are saved on this job.");
    } finally {
      setBusy(false);
      setGenStep(null);
    }
  }

  function connectGoogle() {
    if (googleAuth?.connect_url) {
      window.location.href = googleAuth.connect_url;
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${base.replace(/\/$/, "")}/auth/google`;
  }

  async function tryGoogleDoc() {
    if (googleAuth?.configured && !googleAuth.connected) {
      connectGoogle();
      return;
    }
    setGoogleBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/google-doc`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as GoogleDocExportResult & {
        detail?: unknown;
      };
      if (!res.ok) {
        setMessage(formatFastApiDetail(data, res.status));
        return;
      }
      if (data.resume_doc_url) setResumeDocUrl(data.resume_doc_url);
      if (data.letter_doc_url) setLetterDocUrl(data.letter_doc_url);
      setMessage(data.message || "Exported to Google Docs.");
    } catch {
      setMessage("Could not reach the API for Google Docs export.");
    } finally {
      setGoogleBusy(false);
    }
  }

  function downloadBundle() {
    const chunks: string[] = [];
    if (resume.trim()) chunks.push(`TAILORED RESUME\n\n${resume}`);
    if (letter.trim()) chunks.push(`COVER LETTER\n\n${letter}`);
    if (!chunks.length) return;
    downloadTextFile(
      `application-${job.company || "job"}.txt`.replace(/\s+/g, "-").toLowerCase(),
      chunks.join("\n\n---\n\n"),
    );
  }

  const canGenerate =
    !busy &&
    !uploadBusy &&
    (sourceMode === "upload" ? hasUploadedResume : profile.trim().length > 0);

  const previewBody = previewExpanded
    ? uploadedPreview
    : previewExcerpt(uploadedPreview);

  return (
    <section className="ja-card">
      <h2 className="ja-section-title">AI application kit</h2>
      <p className="ja-hint" style={{ marginTop: "-0.25rem", marginBottom: "1.1rem" }}>
        Upload a CV or paste bullets, then generate tailored documents for this posting.
      </p>

      <div className="ja-field">
        <label className="ja-label" htmlFor="ja-output-lang">
          CV &amp; cover letter language
        </label>
        <select
          id="ja-output-lang"
          className="ja-select"
          value={outputLanguage}
          disabled={uploadBusy || busy}
          onChange={(e) => void onLanguageChange(e.target.value === "de" ? "de" : "en")}
        >
          <option value="en">English</option>
          <option value="de">German (Sie)</option>
        </select>
      </div>

      <div className="ja-field">
        <span className="ja-label" id="ja-source-label">
          Your background
        </span>
        <div
          className="ja-tabs-list"
          role="tablist"
          aria-labelledby="ja-source-label"
          style={{ marginBottom: "1rem" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "upload"}
            className="ja-tab"
            data-active={sourceMode === "upload" ? "true" : undefined}
            onClick={() => setSourceMode("upload")}
          >
            Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "paste"}
            className="ja-tab"
            data-active={sourceMode === "paste" ? "true" : undefined}
            onClick={() => setSourceMode("paste")}
          >
            Paste
          </button>
        </div>

        {sourceMode === "upload" ? (
          <div className="ja-source-panel" role="tabpanel">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept={ACCEPT}
              className="ja-file-input"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
              disabled={uploadBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <label
              htmlFor={fileInputId}
              className={`ja-dropzone${dragOver ? " ja-dropzone--drag" : ""}${uploadBusy ? " ja-dropzone--disabled" : ""}`}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!uploadBusy) setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploadBusy) setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget === e.target) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (uploadBusy) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadFile(file);
              }}
            >
              <p className="ja-dropzone-title">
                {uploadBusy ? "Uploading…" : "Drop your CV here or click to browse"}
              </p>
              <p className="ja-dropzone-hint">
                Text is extracted from PDF, TXT, or MD and used with the job description.
              </p>
              <span className="ja-dropzone-formats">PDF · TXT · MD</span>
            </label>

            {hasUploadedResume ? (
              <div className="ja-resume-preview">
                <div className="ja-resume-preview-head">
                  <p className="ja-resume-preview-title">Extracted preview</p>
                  <div className="ja-resume-preview-actions">
                    <button
                      type="button"
                      className="ja-btn ja-btn--ghost ja-btn--sm"
                      onClick={() => setPreviewExpanded((v) => !v)}
                    >
                      {previewExpanded ? "Show less" : "Show full text"}
                    </button>
                    <button
                      type="button"
                      className="ja-btn ja-btn--ghost ja-btn--sm"
                      disabled={uploadBusy}
                      onClick={() => void clearUploadedResume()}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className="ja-resume-preview-meta">
                  {uploadFileName ? (
                    <>
                      {uploadFileName}
                      {uploadFileSize != null ? ` · ${formatBytes(uploadFileSize)}` : ""}
                      {" · "}
                    </>
                  ) : null}
                  {uploadedPreview.length.toLocaleString()} chars
                </p>
                <pre className="ja-resume-preview-body">{previewBody}</pre>
              </div>
            ) : (
              <p className="ja-hint" style={{ marginTop: "0.75rem" }}>
                No resume on file yet. Upload a CV to enable generation.
              </p>
            )}
          </div>
        ) : (
          <div className="ja-source-panel" role="tabpanel">
            <div className="ja-profile-actions">
              <button
                type="button"
                className="ja-btn ja-btn--ghost ja-btn--sm"
                onClick={() => void loadMasterProfile()}
              >
                Use master profile
              </button>
              <button
                type="button"
                className="ja-btn ja-btn--ghost ja-btn--sm"
                onClick={() => void saveMasterProfile()}
                disabled={!profile.trim()}
              >
                Save as master profile
              </button>
              {profileSaveHint ? (
                <span className="ja-text-actions-hint">{profileSaveHint}</span>
              ) : null}
            </div>
            <label className="ja-label" htmlFor="ja-profile">
              Roles, stack, metrics, education
            </label>
            <textarea
              id="ja-profile"
              className="ja-textarea"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              rows={10}
              disabled={busy}
              placeholder="Paste your master resume bullets or a short professional summary…"
            />
          </div>
        )}
      </div>

      <div className="ja-field">
        <label className="ja-label" htmlFor="ja-regenerate-hint">
          Extra instructions (optional)
        </label>
        <textarea
          id="ja-regenerate-hint"
          className="ja-textarea"
          rows={2}
          value={regenerateHint}
          onChange={(e) => setRegenerateHint(e.target.value)}
          disabled={busy}
          placeholder='e.g. "Shorter", "More formal German", "Emphasize React and TypeScript"'
        />
      </div>

      <div className="ja-generate-row">
        <button
          type="button"
          className="ja-btn ja-btn--primary"
          onClick={() => void runGenerate(["resume", "cover_letter", "ats", "skill_fit"])}
          disabled={!canGenerate}
        >
          {busy ? genStep ?? "Generating…" : "Generate all"}
        </button>
        <button
          type="button"
          className="ja-btn ja-btn--ghost ja-btn--sm"
          disabled={!canGenerate || busy}
          onClick={() => void runGenerate(["resume"])}
        >
          Resume
        </button>
        <button
          type="button"
          className="ja-btn ja-btn--ghost ja-btn--sm"
          disabled={!canGenerate || busy}
          onClick={() => void runGenerate(["cover_letter"])}
        >
          Letter
        </button>
        <button
          type="button"
          className="ja-btn ja-btn--ghost ja-btn--sm"
          disabled={!canGenerate || busy}
          onClick={() => void runGenerate(["ats"])}
        >
          ATS
        </button>
        <button
          type="button"
          className="ja-btn ja-btn--ghost ja-btn--sm"
          disabled={!canGenerate || busy}
          onClick={() => void runGenerate(["skill_fit"])}
        >
          Skills
        </button>
      </div>

      {!canGenerate && !busy && !uploadBusy ? (
        <p className="ja-hint" style={{ marginTop: "0.65rem" }}>
          {sourceMode === "upload"
            ? "Upload a CV to continue."
            : "Add some background text to continue."}
        </p>
      ) : null}

      {busy && genStep ? (
        <p className="ja-progress" role="status">
          {genStep} This often takes 30–60 seconds.
        </p>
      ) : null}

      {message ? (
        message.startsWith("Done") ||
        message.includes("uploaded") ||
        message.includes("Removed") ||
        message.includes("preview") ||
        message.includes("Master profile") ||
        message.includes("Loaded") ||
        message.includes("Exported") ? (
          <div className="ja-alert ja-alert--success" style={{ marginTop: "1rem" }}>
            {message}
          </div>
        ) : (
          <div className="ja-alert ja-alert--error" style={{ marginTop: "1rem" }} role="alert">
            {message}
          </div>
        )
      ) : null}

      {googleAuth?.configured && !googleAuth.connected ? (
        <div className="ja-alert ja-alert--warn" style={{ marginTop: "1rem" }}>
          Connect Google to export tailored documents to Docs.{" "}
          <button type="button" className="ja-link ja-link--inline" onClick={connectGoogle}>
            Connect Google account
          </button>
        </div>
      ) : null}

      {(resume || letter) && (
        <div className="ja-output-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="ja-btn ja-btn--ghost ja-btn--sm" onClick={downloadBundle}>
            Download all (.txt)
          </button>
          <button
            type="button"
            className="ja-btn ja-btn--ghost ja-btn--sm"
            disabled={googleBusy}
            onClick={() => void tryGoogleDoc()}
          >
            {googleBusy
              ? "Exporting…"
              : googleAuth?.configured && !googleAuth.connected
                ? "Connect Google & export"
                : "Export to Google Docs"}
          </button>
        </div>
      )}

      {(resumeDocUrl || letterDocUrl) && (
        <div className="ja-google-links">
          {resumeDocUrl ? (
            <a href={resumeDocUrl} target="_blank" rel="noreferrer" className="ja-link">
              Open resume in Google Docs ↗
            </a>
          ) : null}
          {letterDocUrl ? (
            <a href={letterDocUrl} target="_blank" rel="noreferrer" className="ja-link">
              Open cover letter in Google Docs ↗
            </a>
          ) : null}
        </div>
      )}

      {resume ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <div className="ja-output-head">
            <h3 className="ja-section-title">Tailored resume</h3>
            <TextActions text={resume} downloadName="tailored-resume.txt" />
          </div>
          <pre className="ja-prose">{resume}</pre>
        </div>
      ) : null}

      {letter ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <div className="ja-output-head">
            <h3 className="ja-section-title">Cover letter</h3>
            <TextActions text={letter} downloadName="cover-letter.txt" />
          </div>
          <pre className="ja-prose" style={{ maxHeight: "18rem" }}>
            {letter}
          </pre>
        </div>
      ) : null}

      {skillFit?.skills && skillFit.skills.length > 0 ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <h3 className="ja-section-title">Skill fit</h3>
          <ul className="ja-skill-list">
            {skillFit.skills.map((s) => (
              <li key={s.name} className={`ja-skill-item ja-skill-item--${s.level}`}>
                <span className="ja-skill-name">{s.name}</span>
                <span className="ja-skill-level">{s.level}</span>
                {s.note ? <span className="ja-skill-note">{s.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ats && typeof ats.keyword_coverage_percent === "number" ? (
        <div style={{ marginTop: "1.35rem" }}>
          <hr className="ja-divider" />
          <h3 className="ja-section-title">ATS-style check</h3>
          <div className="ja-ats-score">{ats.keyword_coverage_percent}%</div>
          <div className="ja-ats-label">estimated keyword overlap</div>
          {ats.matched_keywords && ats.matched_keywords.length > 0 ? (
            <div style={{ marginTop: "0.85rem" }}>
              <span className="ja-label">Strong matches</span>
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
              <span className="ja-label">Gaps to consider</span>
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
