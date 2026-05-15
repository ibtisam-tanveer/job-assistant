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

export type SkillFitItem = {
  name: string;
  level: "strong" | "moderate" | "gap";
  note?: string;
};

export type SkillFit = {
  skills?: SkillFitItem[];
};

export type JdSection = {
  id: string;
  title: string;
  body: string;
};

export type JdSections = {
  summary?: string;
  sections?: JdSection[];
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
  uploaded_resume_text?: string | null;
  tailored_resume_text?: string | null;
  cover_letter_text?: string | null;
  ats_report?: AtsReport | null;
  skill_fit?: SkillFit | null;
  output_language?: "en" | "de";
  applied_at?: string | null;
  interview_at?: string | null;
  jd_sections?: JdSections | null;
  google_resume_doc_id?: string | null;
  google_resume_doc_url?: string | null;
  google_letter_doc_id?: string | null;
  google_letter_doc_url?: string | null;
};

export type GoogleAuthStatus = {
  configured: boolean;
  connected: boolean;
  connect_url?: string | null;
};

export type GoogleDocExportResult = {
  resume_doc_url?: string | null;
  letter_doc_url?: string | null;
  message: string;
};

export type MasterProfile = {
  text: string;
  updated_at: string | null;
};

export type JobListParams = {
  q?: string;
  status?: string;
  sort?: "updated" | "title" | "company";
  limit?: number;
};

export async function fetchJobs(params?: JobListParams): Promise<Job[]> {
  const u = new URL(`${getApiBase()}/jobs`);
  if (params?.q) u.searchParams.set("q", params.q);
  if (params?.status) u.searchParams.set("status", params.status);
  if (params?.sort) u.searchParams.set("sort", params.sort);
  if (params?.limit) u.searchParams.set("limit", String(params.limit));
  const res = await fetch(u.toString(), { cache: "no-store" });
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
