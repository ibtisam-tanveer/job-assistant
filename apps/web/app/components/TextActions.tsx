"use client";

import { useState } from "react";
import { copyToClipboard, downloadTextFile } from "@/lib/client-download";

type Props = {
  text: string;
  downloadName: string;
  label?: string;
};

export function TextActions({ text, downloadName, label = "Copy" }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  async function onCopy() {
    const ok = await copyToClipboard(text);
    setHint(ok ? "Copied" : "Copy failed");
    setTimeout(() => setHint(null), 2000);
  }

  function onDownload() {
    downloadTextFile(downloadName, text);
    setHint("Downloaded");
    setTimeout(() => setHint(null), 2000);
  }

  if (!text.trim()) return null;

  return (
    <div className="ja-text-actions">
      <button type="button" className="ja-btn ja-btn--ghost ja-btn--sm" onClick={() => void onCopy()}>
        {label}
      </button>
      <button type="button" className="ja-btn ja-btn--ghost ja-btn--sm" onClick={onDownload}>
        Download
      </button>
      {hint ? <span className="ja-text-actions-hint">{hint}</span> : null}
    </div>
  );
}
