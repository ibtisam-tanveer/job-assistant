import { NextResponse } from "next/server";
import { getApiBase } from "@/lib/api";
import { buildJobApiHeaders } from "@/lib/server-job-api-headers";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const upstream = await fetch(`${getApiBase()}/jobs/${jobId}/google-doc`, {
    method: "POST",
    headers: buildJobApiHeaders(),
  });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
