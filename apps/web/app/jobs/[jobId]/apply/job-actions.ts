"use server";

import { revalidatePath } from "next/cache";
import { getApiBase, type Job } from "@/lib/api";
import { formatFastApiDetail } from "@/lib/format-fastapi-detail";
import { buildJobApiHeaders } from "@/lib/server-job-api-headers";

export type PatchJobPayload = {
  application_status?: string;
  notes?: string;
  profile_text?: string;
  uploaded_resume_text?: string | null;
  output_language?: "en" | "de";
  applied_at?: string | null;
  interview_at?: string | null;
};

export async function patchJobAction(
  jobId: string,
  body: PatchJobPayload,
): Promise<{ ok: true; job: Job } | { ok: false; error: string }> {
  const res = await fetch(`${getApiBase()}/jobs/${jobId}`, {
    method: "PATCH",
    headers: buildJobApiHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: formatFastApiDetail(data, res.status) };
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}/apply`);
  return { ok: true, job: data as Job };
}

export async function generateApplyAction(
  jobId: string,
  payload: {
    profile_text?: string;
    output_language?: "en" | "de";
    parts?: string[];
    regenerate_instructions?: string;
  },
): Promise<{ ok: true; job: Job } | { ok: false; error: string }> {
  const res = await fetch(`${getApiBase()}/jobs/${jobId}/generate`, {
    method: "POST",
    headers: buildJobApiHeaders({ json: true }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: formatFastApiDetail(data, res.status) };
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}/apply`);
  return { ok: true, job: data as Job };
}

export async function uploadResumeFileAction(
  jobId: string,
  formData: FormData,
): Promise<{ ok: true; job: Job } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return { ok: false, error: "Choose a non-empty file." };
  }
  const filename = file instanceof File && file.name ? file.name : "resume.pdf";
  const buf = await file.arrayBuffer();
  const outgoing = new FormData();
  outgoing.append(
    "file",
    new File([buf], filename, { type: file.type || "application/octet-stream" }),
  );

  const res = await fetch(`${getApiBase()}/jobs/${jobId}/resume-file`, {
    method: "POST",
    headers: buildJobApiHeaders(),
    body: outgoing,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: formatFastApiDetail(data, res.status) };
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}/apply`);
  return { ok: true, job: data as Job };
}
