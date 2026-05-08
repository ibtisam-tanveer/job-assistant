from __future__ import annotations

import hashlib
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from pymongo import ReturnDocument

from config import Settings, get_settings
from llm_apply import ats_report, cover_letter, tailor_resume

security = HTTPBearer(auto_error=False)

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
    return out


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
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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


class GenerateApplyBody(BaseModel):
    """profile_text overrides the value stored on the job for this run (and is saved)."""

    profile_text: str | None = None
    parts: list[str] | None = None


_GENERATE_PARTS = frozenset({"resume", "cover_letter", "ats"})


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
    tailored_resume_text: str | None = None
    cover_letter_text: str | None = None
    ats_report: dict[str, Any] | None = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


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
    return IngestJobResponse(job_id=jid, deduplicated=True, apply_path=f"/jobs/{jid}/apply")


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
        "created_at": now,
        "updated_at": now,
    }
    result = await jobs.insert_one(doc)
    jid = str(result.inserted_id)
    return IngestJobResponse(job_id=jid, deduplicated=False, apply_path=f"/jobs/{jid}/apply")


@app.get("/jobs", response_model=list[JobPublic])
async def list_jobs(request: Request, limit: int = 100) -> list[dict[str, Any]]:
    db: AsyncIOMotorDatabase = request.app.state.db
    cap = max(1, min(limit, 200))
    cursor = db["jobs"].find().sort("updated_at", -1).limit(cap)
    items: list[dict[str, Any]] = []
    async for doc in cursor:
        items.append(job_doc_response(doc))
    return items


@app.get("/jobs/{job_id}", response_model=JobPublic)
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


@app.patch("/jobs/{job_id}", response_model=JobPublic)
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


@app.post("/jobs/{job_id}/generate", response_model=JobPublic)
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
    profile = (raw_profile or "").strip()
    if len(profile) < 50:
        raise HTTPException(
            status_code=400,
            detail="Add your background or master resume in the profile box (at least ~50 characters), then generate.",
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
        raise HTTPException(status_code=400, detail=f"Unknown parts: {sorted(unknown)}. Use resume, cover_letter, ats.")
    if not parts:
        parts = frozenset(_GENERATE_PARTS)

    title = (doc.get("title") or "Role").strip()
    company = doc.get("company")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    model = settings.openai_model

    updates: dict[str, Any] = {"profile_text": profile, "updated_at": datetime.now(UTC)}
    tailored = (doc.get("tailored_resume_text") or "").strip()

    try:
        if "resume" in parts:
            tailored = await tailor_resume(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=profile,
            )
            updates["tailored_resume_text"] = tailored
        elif ("cover_letter" in parts or "ats" in parts) and len(tailored) < 80:
            tailored = await tailor_resume(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=profile,
            )
            updates["tailored_resume_text"] = tailored

        if "cover_letter" in parts:
            updates["cover_letter_text"] = await cover_letter(
                client=client,
                model=model,
                title=title,
                company=company,
                jd=jd,
                profile=profile,
                tailored_resume=tailored,
            )

        if "ats" in parts:
            updates["ats_report"] = await ats_report(
                client=client,
                model=model,
                jd=jd,
                profile=profile,
                tailored_resume=tailored,
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
