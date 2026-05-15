"""Heuristic job-description sectioning (no LLM)."""

from __future__ import annotations

import re
from typing import Any

_SECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("requirements", re.compile(r"^(requirements|qualifications|must[- ]have|what you.?ll need)\b", re.I)),
    ("nice_to_have", re.compile(r"^(nice[- ]to[- ]have|preferred|bonus|plus)\b", re.I)),
    ("responsibilities", re.compile(r"^(responsibilities|what you.?ll do|your role|the role)\b", re.I)),
    ("about", re.compile(r"^(about (the )?(role|job|company|us)|who we are)\b", re.I)),
    ("benefits", re.compile(r"^(benefits|what we offer|perks)\b", re.I)),
]


def parse_job_description(text: str | None) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {"summary": "", "sections": []}

    lines = [ln.strip() for ln in re.split(r"\n+", raw) if ln.strip()]
    sections: list[dict[str, str]] = []
    current_title = "Overview"
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines, current_title
        body = "\n".join(current_lines).strip()
        if body:
            sections.append({"id": _slug(current_title), "title": current_title, "body": body})
        current_lines = []

    for ln in lines:
        heading = _looks_like_heading(ln)
        if heading:
            flush()
            current_title = heading
            matched = False
            for key, pat in _SECTION_PATTERNS:
                if pat.search(ln):
                    current_title = ln.rstrip(":")
                    break
            if not matched and len(ln) < 80:
                current_title = ln.rstrip(":")
            continue
        current_lines.append(ln)

    flush()

    summary = sections[0]["body"][:600] if sections else raw[:600]
    return {"summary": summary, "sections": sections}


def _slug(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s or "section"


def _looks_like_heading(line: str) -> bool:
    if len(line) > 100:
        return False
    if line.endswith(":") and len(line) < 60:
        return True
    if line.isupper() and len(line) < 60:
        return True
    for _, pat in _SECTION_PATTERNS:
        if pat.search(line):
            return True
    return False
