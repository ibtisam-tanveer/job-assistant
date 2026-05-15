"use client";

import { useSearchParams } from "next/navigation";

export function GoogleConnectedBanner() {
  const sp = useSearchParams();
  const google = sp.get("google");
  if (google === "connected") {
    return (
      <div className="ja-alert ja-alert--success" style={{ marginBottom: "1.25rem" }}>
        Google account connected. You can export documents from any job&apos;s AI kit tab.
      </div>
    );
  }
  if (google === "error") {
    return (
      <div className="ja-alert ja-alert--error" style={{ marginBottom: "1.25rem" }} role="alert">
        Google sign-in was cancelled or failed. Try connecting again from a job&apos;s AI kit.
      </div>
    );
  }
  return null;
}
