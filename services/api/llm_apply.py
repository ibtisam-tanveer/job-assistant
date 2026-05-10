from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

JD_CAP = 14_000
PROFILE_CAP = 14_000


def _clip(text: str, max_len: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 20] + "\n… [truncated]"


async def tailor_resume(
    *,
    client: AsyncOpenAI,
    model: str,
    title: str,
    company: str | None,
    jd: str,
    profile: str,
) -> str:
    system = (
        "You are an expert resume writer. Output ONLY plain text — clear sections "
        "(Summary, Experience, Skills, Education as relevant). No markdown fences. "
        "Stay truthful to the candidate profile; do not invent employers, dates, or degrees."
    )
    user = (
        f"Job title: {title}\nCompany: {company or 'Unknown'}\n\n"
        f"Job description:\n{_clip(jd, JD_CAP)}\n\n"
        f"Candidate profile / master resume to tailor from:\n{_clip(profile, PROFILE_CAP)}\n\n"
        "Write a tailored resume for this application."
    )
    r = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.35,
    )
    return (r.choices[0].message.content or "").strip()


async def cover_letter(
    *,
    client: AsyncOpenAI,
    model: str,
    title: str,
    company: str | None,
    jd: str,
    profile: str,
    tailored_resume: str,
) -> str:
    system = (
        "You write concise, professional cover letters. Output ONLY the letter body in plain text "
        "(greeting, 2–3 short paragraphs, closing). No markdown. No placeholder [brackets]."
    )
    resume_bit = _clip(tailored_resume, 3500)
    user = (
        f"Role: {title} at {company or 'the company'}\n\n"
        f"Job description:\n{_clip(jd, 6000)}\n\n"
        f"Candidate background:\n{_clip(profile, 4000)}\n\n"
        f"Tailored resume (excerpt):\n{resume_bit}\n\n"
        "Write a cover letter for this application."
    )
    r = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.45,
    )
    return (r.choices[0].message.content or "").strip()


def _fallback_ats(jd: str, resume: str) -> dict[str, Any]:
    """Cheap keyword overlap if the model returns bad JSON."""
    stop = re.compile(r"[\W_]+", re.UNICODE)
    jd_words = {w.lower() for w in stop.split(jd) if len(w) > 2}
    rs_words = {w.lower() for w in stop.split(resume) if len(w) > 2}
    jd_words.discard("")
    if not jd_words:
        return {
            "keyword_coverage_percent": 0,
            "matched_keywords": [],
            "missing_keywords": [],
            "suggestions": ["Add a job description to analyze keyword overlap."],
        }
    matched = sorted(jd_words & rs_words)[:40]
    missing = sorted((jd_words - rs_words))[:25]
    pct = int(round(100 * len(matched) / max(len(jd_words), 1)))
    return {
        "keyword_coverage_percent": min(100, pct),
        "matched_keywords": matched[:20],
        "missing_keywords": missing[:20],
        "suggestions": [
            "Consider weaving missing terms into your bullets where truthful.",
            "Use simple section headings and standard job titles for ATS parsing.",
        ],
    }


async def ats_report(
    *,
    client: AsyncOpenAI,
    model: str,
    jd: str,
    profile: str,
    tailored_resume: str,
) -> dict[str, Any]:
    resume_for_compare = tailored_resume.strip() or profile
    system = (
        "You compare a job description to a resume for ATS-style relevance. "
        "Reply with ONLY valid JSON, no markdown."
    )
    user = (
        "Return a JSON object with exactly these keys:\n"
        '"keyword_coverage_percent": integer 0-100,\n'
        '"matched_keywords": array of up to 25 short strings (skills/terms from the JD found in the resume),\n'
        '"missing_keywords": array of up to 25 important JD terms weak or absent in the resume,\n'
        '"suggestions": array of 3-6 short actionable tips (formatting, keywords, metrics).\n\n'
        f"Job description:\n{_clip(jd, JD_CAP)}\n\n"
        f"Resume text to score:\n{_clip(resume_for_compare, PROFILE_CAP)}"
    )
    r = await client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
    )
    raw = (r.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("not an object")
        data.setdefault("keyword_coverage_percent", 0)
        data.setdefault("matched_keywords", [])
        data.setdefault("missing_keywords", [])
        data.setdefault("suggestions", [])
        return data
    except (json.JSONDecodeError, ValueError):
        return _fallback_ats(jd, resume_for_compare)
