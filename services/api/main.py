from __future__ import annotations

import asyncio
import hashlib
import io
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, FastAPI, File, HTTPException, Request, Security, UploadFile
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from pymongo import ReturnDocument

from config import Settings, get_settings
from google_auth import (
    clear_credentials,
    create_flow,
    get_valid_credentials,
    google_configured,
    pop_oauth_state,
    save_credentials,
    store_oauth_state,
)
from google_docs_export import create_or_update_document
from jd_parse import parse_job_description
from llm_apply import OutputLanguage, ats_report, cover_letter, skill_fit_report, tailor_resume

security = HTTPBearer(auto_error=False)

MAX_RESUME_UPLOAD_BYTES = 2 * 1024 * 1024

TRACKING_QUERY_KEYS = frozenset(
    k.lower()
    for k in (
        "trk",
        "refId",
        "trackingId",
        "trackableId",
        "upsellOrderOrigin",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "originalSubdomain",
    )
)


def normalize_job_url(url: str) -> str:
    u = urlparse(url.strip())
    scheme = (u.scheme or "https").lower()
    netloc = (u.netloc or "").lower()
    path = (u.path or "").rstrip("/")
    pairs = [
        (k, v)
        for k, v in parse_qsl(u.query, keep_blank_values=True)
        if k.lower() not in TRACKING_QUERY_KEYS
    ]
    pairs.sort()
    query = urlencode(pairs)
    return urlunparse((scheme, netloc, path, "", query, ""))


def linkedin_external_id(url: str) -> str | None:
    m = re.search(r"/jobs/view/(\d+)", url)
    return m.group(1) if m else None


def compute_dedupe_key(source: str, title: str, company: str | None) -> str:
    raw = f"{source.strip().lower()}|{title.strip().lower()}|{(company or '').strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def job_doc_response(doc: dict[str, Any]) -> dict[str, Any]:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    ol = out.get("output_language") or "en"
    out["output_language"] = ol if ol in ("en", "de") else "en"
    if "uploaded_resume_text" not in out:
        out["uploaded_resume_text"] = None
    if "applied_at" not in out:
        out["applied_at"] = None
    if "interview_at" not in out:
        out["interview_at"] = None
    if "skill_fit" not in out:
        out["skill_fit"] = None
    for key in (
        "google_resume_doc_id",
        "google_resume_doc_url",
        "google_letter_doc_id",
        "google_letter_doc_url",
    ):
        if key not in out:
            out[key] = None
    desc = out.get("description_text")
    out["jd_sections"] = parse_job_description(desc if isinstance(desc, str) else None)
    return out


def _allowed_cors_origins(settings: Settings) -> list[str]:
    base = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = [x.strip() for x in (settings.cors_extra_origins or "").split(",") if x.strip()]
    merged = base + extra
    return list(dict.fromkeys(merged))


def _candidate_material(uploaded: str | None, profile: str) -> str:
    u = (uploaded or "").strip()
    p = (profile or "").strip()
    if u and p:
        return f"{u}\n\n--- Additional profile notes ---\n\n{p}"
    return u or p


def _coerce_output_language(value: Any) -> OutputLanguage:
    if value == "de":
        return "de"
    return "en"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.get_default_database()
    app.state.mongo_client = client
    app.state.db = db

    jobs = db["jobs"]
    await jobs.create_index("normalized_url", unique=True)
    await jobs.create_index(
        [("source", 1), ("external_id", 1)],
        unique=True,
        partialFilterExpression={"external_id": {"$type": "string", "$gt": ""}},
    )
    await jobs.create_index([("updated_at", -1)])

    yield

    client.close()


app = FastAPI(title="Job Assistant API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(get_settings()),
    # Chrome extension popup fetch() sends Origin: chrome-extension://<id>
    allow_origin_regex=r"^chrome-extension://.+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def require_ingest_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    if not settings.ingest_secret:
        raise HTTPException(status_code=503, detail="INGEST_SECRET is not configured")
    token = credentials.credentials if credentials else None
    if not token or token != settings.ingest_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing ingest token")


async def require_job_api_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    secret = (settings.web_api_secret or "").strip()
    if not secret:
        return
    token = credentials.credentials if credentials else None
    if not token or token != secret:
        raise HTTPException(status_code=401, detail="Invalid or missing job API token")


_job_api_dep = [Depends(require_job_api_token)]


class JobIngestBody(BaseModel):
    source: str = "linkedin"
    source_url: HttpUrl
    title: str = Field(..., min_length=1)
    company: str | None = None
    location: str | None = None
    description_text: str | None = None
    external_id: str | None = None


class IngestJobResponse(BaseModel):
    job_id: str
    deduplicated: bool
    apply_path: str


class JobPatchBody(BaseModel):
    application_status: str | None = None
    notes: str | None = None
    profile_text: str | None = None
    uploaded_resume_text: str | None = None
    output_language: Literal["en", "de"] | None = None
    applied_at: datetime | None = None
    interview_at: datetime | None = None


class GenerateApplyBody(BaseModel):
    """profile_text overrides the value stored on the job for this run (and is saved)."""

    profile_text: str | None = None
    parts: list[str] | None = None
    output_language: Literal["en", "de"] | None = None
    regenerate_instructions: str | None = None


_GENERATE_PARTS = frozenset({"resume", "cover_letter", "ats", "skill_fit"})


class MasterProfileBody(BaseModel):
    text: str = ""


class MasterProfilePublic(BaseModel):
    text: str
    updated_at: datetime | None = None


class JobPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    source: str
    source_url: str
    normalized_url: str
    external_id: str | None
    title: str
    company: str | None
    location: str | None
    description_text: str | None
    application_status: str
    notes: str
    created_at: datetime
    updated_at: datetime
    profile_text: str | None = None
    uploaded_resume_text: str | None = None
    tailored_resume_text: str | None = None
    cover_letter_text: str | None = None
    ats_report: dict[str, Any] | None = None
    skill_fit: dict[str, Any] | None = None
    output_language: Literal["en", "de"] = "en"
    applied_at: datetime | None = None
    interview_at: datetime | None = None
    jd_sections: dict[str, Any] | None = None
    google_resume_doc_id: str | None = None
    google_resume_doc_url: str | None = None
    google_letter_doc_id: str | None = None
    google_letter_doc_url: str | None = None


class GoogleAuthStatus(BaseModel):
    configured: bool
    connected: bool
    connect_url: str | None = None


class GoogleDocExportResponse(BaseModel):
    resume_doc_id: str | None = None
    resume_doc_url: str | None = None
    letter_doc_id: str | None = None
    letter_doc_url: str | None = None
    message: str


@app.get("/health")
async def health(request: Request) -> dict[str, Any]:
    out: dict[str, Any] = {"status": "ok", "mongodb": "unknown"}
    db = getattr(request.app.state, "db", None)
    if db is None:
        out["mongodb"] = "not_connected"
        return out
    try:
        await db.command("ping")
        out["mongodb"] = "ok"
    except Exception as e:
        out["status"] = "degraded"
        out["mongodb"] = f"error: {e!s}"
    return out


def _ingest_merge_updates(existing: dict[str, Any], body: JobIngestBody, url_str: str, ext_id: str | None) -> dict[str, Any]:
    """Fill in missing or longer fields when the same job is ingested again (e.g. extension after a stub)."""
    updates: dict[str, Any] = {"updated_at": datetime.now(UTC), "source_url": url_str}
    if body.title.strip():
        updates["title"] = body.title.strip()
    if body.company and body.company.strip():
        updates["company"] = body.company.strip()
    if body.location and body.location.strip():
        updates["location"] = body.location.strip()
    if ext_id and not (existing.get("external_id") or "").strip():
        updates["external_id"] = ext_id
    old_desc = (existing.get("description_text") or "").strip()
    new_desc = (body.description_text or "").strip()
    if new_desc and len(new_desc) > len(old_desc):
        updates["description_text"] = body.description_text
    return updates


async def _ingest_return_or_merge(
    jobs: Any,
    existing: dict[str, Any],
    body: JobIngestBody,
    url_str: str,
    ext_id: str | None,
) -> IngestJobResponse:
    oid = existing["_id"]
    merged = _ingest_merge_updates(existing, body, url_str, ext_id)
    await jobs.update_one({"_id": oid}, {"$set": merged})
    jid = str(oid)
    return IngestJobResponse(job_id=jid, deduplicated=True, apply_path=f"/jobs/{jid}/apply?tab=ai")


@app.post("/ingest/job", response_model=IngestJobResponse, dependencies=[Depends(require_ingest_token)])
async def ingest_job(body: JobIngestBody, request: Request) -> IngestJobResponse:
    db: AsyncIOMotorDatabase = request.app.state.db
    jobs = db["jobs"]

    url_str = str(body.source_url)
    normalized = normalize_job_url(url_str)
    ext_id = (body.external_id or "").strip() or None
    if body.source.lower() == "linkedin" and not ext_id:
        ext_id = linkedin_external_id(url_str)

    dedupe_key = compute_dedupe_key(body.source, body.title, body.company)

    existing = await jobs.find_one({"normalized_url": normalized})
    if existing:
        return await _ingest_return_or_merge(jobs, existing, body, url_str, ext_id)

    if ext_id:
        existing = await jobs.find_one({"source": body.source, "external_id": ext_id})
        if existing:
            return await _ingest_return_or_merge(jobs, existing, body, url_str, ext_id)

    existing = await jobs.find_one({"dedupe_key": dedupe_key})
    if existing:
        return await _ingest_return_or_merge(jobs, existing, body, url_str, ext_id)

    now = datetime.now(UTC)
    doc = {
        "source": body.source,
        "source_url": url_str,
        "normalized_url": normalized,
        "external_id": ext_id,
        "title": body.title.strip(),
        "company": body.company.strip() if body.company else None,
        "location": body.location.strip() if body.location else None,
        "description_text": body.description_text,
        "dedupe_key": dedupe_key,
        "application_status": "saved",
        "notes": "",
        "output_language": "en",
        "uploaded_resume_text": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await jobs.insert_one(doc)
    jid = str(result.inserted_id)
    return IngestJobResponse(job_id=jid, deduplicated=False, apply_path=f"/jobs/{jid}/apply?tab=ai")


@app.get("/profile", response_model=MasterProfilePublic, dependencies=_job_api_dep)
async def get_master_profile(request: Request) -> dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    doc = await db["settings"].find_one({"_id": "master_profile"})
    if not doc:
        return {"text": "", "updated_at": None}
    return {"text": doc.get("text") or "", "updated_at": doc.get("updated_at")}


@app.patch("/profile", response_model=MasterProfilePublic, dependencies=_job_api_dep)
async def patch_master_profile(body: MasterProfileBody, request: Request) -> dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    now = datetime.now(UTC)
    doc = await db["settings"].find_one_and_update(
        {"_id": "master_profile"},
        {"$set": {"text": body.text, "updated_at": now}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"text": doc.get("text") or "", "updated_at": doc.get("updated_at")}


@app.get("/jobs", response_model=list[JobPublic], dependencies=_job_api_dep)
async def list_jobs(
    request: Request,
    limit: int = 100,
    status: str | None = None,
    q: str | None = None,
    sort: Literal["updated", "title", "company"] = "updated",
) -> list[dict[str, Any]]:
    db: AsyncIOMotorDatabase = request.app.state.db
    cap = max(1, min(limit, 200))
    filt: dict[str, Any] = {}
    if status and status.strip():
        filt["application_status"] = status.strip().lower()
    if q and q.strip():
        rx = re.escape(q.strip())
        filt["$or"] = [
            {"title": {"$regex": rx, "$options": "i"}},
            {"company": {"$regex": rx, "$options": "i"}},
            {"location": {"$regex": rx, "$options": "i"}},
        ]
    sort_key = {"updated": ("updated_at", -1), "title": ("title", 1), "company": ("company", 1)}.get(
        sort, ("updated_at", -1)
    )
    cursor = db["jobs"].find(filt).sort([sort_key]).limit(cap)
    items: list[dict[str, Any]] = []
    async for doc in cursor:
        items.append(job_doc_response(doc))
    return items


@app.get("/jobs/{job_id}", response_model=JobPublic, dependencies=_job_api_dep)
async def get_job(job_id: str, request: Request) -> dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e
    doc = await db["jobs"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_doc_response(doc)


@app.patch("/jobs/{job_id}", response_model=JobPublic, dependencies=_job_api_dep)
async def patch_job(job_id: str, body: JobPatchBody, request: Request) -> dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e

    updates: dict[str, Any] = {"updated_at": datetime.now(UTC)}
    if body.application_status is not None:
        updates["application_status"] = body.application_status.strip()
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.profile_text is not None:
        updates["profile_text"] = body.profile_text
    if body.uploaded_resume_text is not None:
        stripped = body.uploaded_resume_text.strip()
        updates["uploaded_resume_text"] = stripped if stripped else None
    if body.output_language is not None:
        updates["output_language"] = body.output_language
    if body.applied_at is not None:
        updates["applied_at"] = body.applied_at
    if body.interview_at is not None:
        updates["interview_at"] = body.interview_at

    if body.application_status is not None:
        st = body.application_status.strip().lower()
        if st == "applied" and body.applied_at is None:
            updates.setdefault("applied_at", datetime.now(UTC))
        if st in ("phone", "onsite") and body.interview_at is None:
            updates.setdefault("interview_at", datetime.now(UTC))

    if len(updates) == 1:
        doc = await db["jobs"].find_one({"_id": oid})
        if not doc:
            raise HTTPException(status_code=404, detail="Job not found")
        return job_doc_response(doc)

    result = await db["jobs"].find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_doc_response(result)


@app.post("/jobs/{job_id}/resume-file", response_model=JobPublic, dependencies=_job_api_dep)
async def upload_job_resume_file(
    job_id: str,
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e

    raw = await file.read(MAX_RESUME_UPLOAD_BYTES + 1)
    if len(raw) > MAX_RESUME_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 2 MB)")
    name = (file.filename or "").lower()
    is_pdf = name.endswith(".pdf") or raw[:4] == b"%PDF"
    if is_pdf:
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw))
            chunks: list[str] = []
            for page in reader.pages:
                chunks.append(page.extract_text() or "")
            text = "\n".join(chunks).strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {e!s}") from e
    elif name.endswith(".txt") or name.endswith(".md"):
        text = raw.decode("utf-8", errors="replace").strip()
    else:
        raise HTTPException(status_code=400, detail="Supported formats: .pdf, .txt, .md")
    if len(text) < 20:
        raise HTTPException(
            status_code=400,
            detail="Too little text extracted; try another file or paste your resume as text.",
        )

    now = datetime.now(UTC)
    result = await db["jobs"].find_one_and_update(
        {"_id": oid},
        {"$set": {"uploaded_resume_text": text, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_doc_response(result)


@app.post("/jobs/{job_id}/generate", response_model=JobPublic, dependencies=_job_api_dep)
async def generate_apply_documents(job_id: str, body: GenerateApplyBody, request: Request) -> dict[str, Any]:
    settings = get_settings()
    if not settings.openai_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set. Add it to services/api/.env and restart the API.",
        )

    db: AsyncIOMotorDatabase = request.app.state.db
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e
    doc = await db["jobs"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")

    raw_profile = body.profile_text if body.profile_text is not None else doc.get("profile_text")
    profile_only = (raw_profile or "").strip()
    uploaded_src = (doc.get("uploaded_resume_text") or "").strip() or None
    material = _candidate_material(uploaded_src, profile_only)
    if len(material) < 50:
        raise HTTPException(
            status_code=400,
            detail=(
                "Upload a resume (.pdf / .txt) or add your background in the profile box "
                "(combined text should be at least ~50 characters), then generate."
            ),
        )

    jd = (doc.get("description_text") or "").strip()
    if len(jd) < 80:
        raise HTTPException(
            status_code=400,
            detail="Job description is missing or too short. Re-send the job from LinkedIn so the description is captured.",
        )

    parts = frozenset(body.parts) if body.parts else _GENERATE_PARTS
    unknown = parts - _GENERATE_PARTS
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown parts: {sorted(unknown)}. Use resume, cover_letter, ats, skill_fit.",
        )
    if not parts:
        parts = frozenset(_GENERATE_PARTS)

    title = (doc.get("title") or "Role").strip()
    company = doc.get("company")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    model = settings.openai_model

    lang = _coerce_output_language(
        body.output_language if body.output_language is not None else doc.get("output_language")
    )

    updates: dict[str, Any] = {
        "profile_text": profile_only,
        "output_language": lang,
        "updated_at": datetime.now(UTC),
    }
    tailored = (doc.get("tailored_resume_text") or "").strip()
    extra = (body.regenerate_instructions or "").strip() or None

    try:
        if "resume" in parts:
            tailored = await tailor_resume(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=material,
                output_language=lang,
                extra_instructions=extra,
            )
            updates["tailored_resume_text"] = tailored
        elif ("cover_letter" in parts or "ats" in parts or "skill_fit" in parts) and len(tailored) < 80:
            tailored = await tailor_resume(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=material,
                output_language=lang,
                extra_instructions=extra,
            )
            updates["tailored_resume_text"] = tailored

        if "cover_letter" in parts:
            updates["cover_letter_text"] = await cover_letter(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=material,
                tailored_resume=tailored,
                output_language=lang,
                extra_instructions=extra,
            )

        if "ats" in parts:
            updates["ats_report"] = await ats_report(
                client=client,
                model=model,
                jd=jd,
                profile=material,
                tailored_resume=tailored,
                output_language=lang,
            )

        if "skill_fit" in parts:
            updates["skill_fit"] = await skill_fit_report(
                client=client,
                model=model,
                jd=jd,
                profile=material,
                output_language=lang,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {e!s}") from e

    await db["jobs"].update_one({"_id": oid}, {"$set": updates})
    fresh = await db["jobs"].find_one({"_id": oid})
    if not fresh:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_doc_response(fresh)


@app.get("/jobs/{job_id}/export", dependencies=_job_api_dep)
async def export_job_documents(
    job_id: str,
    request: Request,
    kind: Literal["resume", "letter", "bundle"] = "bundle",
) -> PlainTextResponse:
    db: AsyncIOMotorDatabase = request.app.state.db
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e
    doc = await db["jobs"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    title = (doc.get("title") or "job").strip()
    company = doc.get("company") or ""
    header = f"{title}" + (f" @ {company}" if company else "") + "\n" + "=" * 40 + "\n\n"
    resume = (doc.get("tailored_resume_text") or "").strip()
    letter = (doc.get("cover_letter_text") or "").strip()
    if kind == "resume":
        body = resume or "No tailored resume yet."
        filename = "tailored-resume.txt"
    elif kind == "letter":
        body = letter or "No cover letter yet."
        filename = "cover-letter.txt"
    else:
        parts = []
        if resume:
            parts.append("TAILORED RESUME\n\n" + resume)
        if letter:
            parts.append("COVER LETTER\n\n" + letter)
        body = "\n\n---\n\n".join(parts) if parts else "No generated documents yet."
        filename = "application-kit.txt"
    return PlainTextResponse(
        content=header + body,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/auth/google/status", response_model=GoogleAuthStatus)
async def google_auth_status(request: Request) -> GoogleAuthStatus:
    settings = get_settings()
    configured = google_configured(settings)
    if not configured:
        return GoogleAuthStatus(configured=False, connected=False)
    db: AsyncIOMotorDatabase = request.app.state.db
    creds = await get_valid_credentials(db, settings)
    base = str(request.base_url).rstrip("/")
    return GoogleAuthStatus(
        configured=True,
        connected=creds is not None,
        connect_url=f"{base}/auth/google",
    )


@app.get("/auth/google")
async def google_auth_start(request: Request) -> RedirectResponse:
    settings = get_settings()
    if not google_configured(settings):
        raise HTTPException(
            status_code=503,
            detail="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in services/api/.env",
        )
    db: AsyncIOMotorDatabase = request.app.state.db
    flow = create_flow(settings)
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    await store_oauth_state(db, state)
    return RedirectResponse(authorization_url)


@app.get("/auth/google/callback")
async def google_auth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    redirect_to = settings.google_success_redirect or "http://localhost:3000/?google=connected"
    if error:
        return RedirectResponse(f"{redirect_to}&google=error")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")
    db: AsyncIOMotorDatabase = request.app.state.db
    if not await pop_oauth_state(db, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    flow = create_flow(settings)
    flow.fetch_token(code=code)
    if not flow.credentials or not flow.credentials.refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google did not return a refresh token. Revoke app access and try again.",
        )
    await save_credentials(db, flow.credentials)
    sep = "&" if "?" in redirect_to else "?"
    return RedirectResponse(f"{redirect_to}{sep}google=connected")


@app.post("/auth/google/disconnect", dependencies=_job_api_dep)
async def google_auth_disconnect(request: Request) -> dict[str, str]:
    db: AsyncIOMotorDatabase = request.app.state.db
    await clear_credentials(db)
    return {"status": "disconnected"}


@app.post("/jobs/{job_id}/google-doc", response_model=GoogleDocExportResponse, dependencies=_job_api_dep)
async def export_job_to_google_docs(job_id: str, request: Request) -> GoogleDocExportResponse:
    settings = get_settings()
    if not google_configured(settings):
        raise HTTPException(
            status_code=503,
            detail="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in services/api/.env",
        )
    db: AsyncIOMotorDatabase = request.app.state.db
    creds = await get_valid_credentials(db, settings)
    if not creds:
        raise HTTPException(
            status_code=401,
            detail="Google account not connected. Open /auth/google in your browser to connect.",
        )
    try:
        oid = ObjectId(job_id)
    except InvalidId as e:
        raise HTTPException(status_code=404, detail="Job not found") from e
    doc = await db["jobs"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")

    resume_text = (doc.get("tailored_resume_text") or "").strip()
    letter_text = (doc.get("cover_letter_text") or "").strip()
    if not resume_text and not letter_text:
        raise HTTPException(
            status_code=400,
            detail="Generate a resume or cover letter first, then export to Google Docs.",
        )

    title_base = (doc.get("title") or "Job").strip()
    company = (doc.get("company") or "").strip()
    suffix = f" — {company}" if company else ""

    updates: dict[str, Any] = {"updated_at": datetime.now(UTC)}
    resume_url: str | None = None
    letter_url: str | None = None

    if resume_text:
        rid, resume_url = await asyncio.to_thread(
            create_or_update_document,
            creds,
            doc.get("google_resume_doc_id"),
            f"Resume: {title_base}{suffix}",
            resume_text,
        )
        updates["google_resume_doc_id"] = rid
        updates["google_resume_doc_url"] = resume_url

    if letter_text:
        lid, letter_url = await asyncio.to_thread(
            create_or_update_document,
            creds,
            doc.get("google_letter_doc_id"),
            f"Cover letter: {title_base}{suffix}",
            letter_text,
        )
        updates["google_letter_doc_id"] = lid
        updates["google_letter_doc_url"] = letter_url

    await db["jobs"].update_one({"_id": oid}, {"$set": updates})

    parts = []
    if resume_url:
        parts.append("resume")
    if letter_url:
        parts.append("cover letter")
    return GoogleDocExportResponse(
        resume_doc_id=updates.get("google_resume_doc_id"),
        resume_doc_url=resume_url,
        letter_doc_id=updates.get("google_letter_doc_id"),
        letter_doc_url=letter_url,
        message=f"Exported {' and '.join(parts)} to Google Docs.",
    )
