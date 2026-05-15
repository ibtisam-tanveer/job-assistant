import "server-only";

import { getApiBase, type Job, type JobListParams, type MasterProfile } from "./api";
import { buildJobApiHeaders } from "./server-job-api-headers";

export async function fetchJobs(params?: JobListParams): Promise<Job[]> {
  const u = new URL(`${getApiBase()}/jobs`);
  if (params?.q) u.searchParams.set("q", params.q);
  if (params?.status) u.searchParams.set("status", params.status);
  if (params?.sort) u.searchParams.set("sort", params.sort);
  if (params?.limit) u.searchParams.set("limit", String(params.limit ?? 100));
  const res = await fetch(u.toString(), {
    cache: "no-store",
    headers: buildJobApiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to load jobs (${res.status})`);
  }
  return res.json() as Promise<Job[]>;
}

export async function fetchJob(id: string): Promise<Job | null> {
  const res = await fetch(`${getApiBase()}/jobs/${id}`, {
    cache: "no-store",
    headers: buildJobApiHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load job (${res.status})`);
  }
  return res.json() as Promise<Job>;
}

export async function fetchMasterProfile(): Promise<MasterProfile> {
  const res = await fetch(`${getApiBase()}/profile`, {
    cache: "no-store",
    headers: buildJobApiHeaders(),
  });
  if (!res.ok) {
    return { text: "", updated_at: null };
  }
  return res.json() as Promise<MasterProfile>;
}
