from main import normalize_job_url


def test_normalize_job_url_strips_tracking_params() -> None:
    raw = "https://www.linkedin.com/jobs/view/123?trk=abc&utm_source=email&refId=1"
    out = normalize_job_url(raw)
    assert "trk=" not in out
    assert "utm_source=" not in out
    assert "refId=" not in out
    assert "/jobs/view/123" in out
