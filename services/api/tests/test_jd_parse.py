from jd_parse import parse_job_description


def test_parse_empty():
    out = parse_job_description(None)
    assert out["sections"] == []


def test_parse_headings():
    text = """About the role
We build great software.

Requirements:
Python experience
Team player

Nice to have:
Kubernetes"""
    out = parse_job_description(text)
    assert len(out["sections"]) >= 2
    titles = [s["title"] for s in out["sections"]]
    assert any("Requirements" in t or "requirements" in t.lower() for t in titles)
