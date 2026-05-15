"use server";

import { getApiBase, type MasterProfile } from "@/lib/api";
import { formatFastApiDetail } from "@/lib/format-fastapi-detail";
import { buildJobApiHeaders } from "@/lib/server-job-api-headers";

export async function fetchMasterProfileAction(): Promise<MasterProfile> {
  const res = await fetch(`${getApiBase()}/profile`, {
    cache: "no-store",
    headers: buildJobApiHeaders(),
  });
  if (!res.ok) {
    return { text: "", updated_at: null };
  }
  return res.json() as Promise<MasterProfile>;
}

export async function saveMasterProfileAction(
  text: string,
): Promise<{ ok: true; profile: MasterProfile } | { ok: false; error: string }> {
  const res = await fetch(`${getApiBase()}/profile`, {
    method: "PATCH",
    headers: buildJobApiHeaders({ json: true }),
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: formatFastApiDetail(data, res.status) };
  }
  return { ok: true, profile: data as MasterProfile };
}
