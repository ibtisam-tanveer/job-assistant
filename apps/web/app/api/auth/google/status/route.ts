import { NextResponse } from "next/server";
import { getApiBase } from "@/lib/api";
import { buildJobApiHeaders } from "@/lib/server-job-api-headers";

export async function GET() {
  const res = await fetch(`${getApiBase()}/auth/google/status`, {
    cache: "no-store",
    headers: buildJobApiHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json(payload, { status: res.status });
}
