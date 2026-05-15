import { NextRequest, NextResponse } from "next/server";
import { getApiBase } from "@/lib/api";
import { buildJobApiHeaders } from "@/lib/server-job-api-headers";

export const runtime = "nodejs";

/**
 * Proxies resume upload to FastAPI so the browser never needs secrets
 * and we avoid Server Action multipart limits / File serialization quirks.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ detail: "Could not read upload (try a smaller file)." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ detail: "Choose a non-empty file." }, { status: 400 });
  }

  const filename = file instanceof File && file.name ? file.name : "resume.pdf";
  const buf = await file.arrayBuffer();
  const outgoing = new FormData();
  outgoing.append(
    "file",
    new File([buf], filename, { type: file.type || "application/octet-stream" }),
  );

  const headers = buildJobApiHeaders();

  const upstream = await fetch(`${getApiBase()}/jobs/${jobId}/resume-file`, {
    method: "POST",
    headers,
    body: outgoing,
  });

  const rawText = await upstream.text();
  let payload: unknown = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = { detail: rawText.slice(0, 240) };
    }
  }

  return NextResponse.json(payload, { status: upstream.status });
}
