const DEFAULT_API = "http://localhost:8000";

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API;
  return base.replace(/\/$/, "");
}

export type AtsReport = {
  keyword_coverage_percent?: number;
  matched_keywords?: string[];
  missing_keywords?: string[];
  suggestions?: string[];
};

export type Job = {
  id: string;
  source: string;
  source_url: string;
  normalized_url: string;
  external_id: string | null;
  title: string;
  company: string | null;
  location: string | null;
  description_text: string | null;
  application_status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  profile_text?: string | null;
  tailored_resume_text?: string | null;
  cover_letter_text?: string | null;
  ats_report?: AtsReport | null;
};

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch(`${getApiBase()}/jobs`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load jobs (${res.status})`);
  }
  return res.json() as Promise<Job[]>;
}

export async function fetchJob(id: string): Promise<Job | null> {
  const res = await fetch(`${getApiBase()}/jobs/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load job (${res.status})`);
  }
  return res.json() as Promise<Job>;
}
