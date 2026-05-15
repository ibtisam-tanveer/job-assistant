"""Google OAuth token storage and credential refresh."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from motor.motor_asyncio import AsyncIOMotorDatabase

from config import Settings

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]

SETTINGS_ID = "google_oauth"
STATE_ID = "google_oauth_state"


def google_configured(settings: Settings) -> bool:
    return bool((settings.google_client_id or "").strip() and (settings.google_client_secret or "").strip())


def _client_config(settings: Settings) -> dict[str, Any]:
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def create_flow(settings: Settings) -> Flow:
    return Flow.from_client_config(
        _client_config(settings),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


def credentials_to_dict(creds: Credentials) -> dict[str, Any]:
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri or "https://oauth2.googleapis.com/token",
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or SCOPES),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
        "updated_at": datetime.now(UTC),
    }


def credentials_from_dict(data: dict[str, Any], settings: Settings) -> Credentials:
    expiry = None
    raw_expiry = data.get("expiry")
    if raw_expiry:
        expiry = datetime.fromisoformat(str(raw_expiry))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=UTC)
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=data.get("client_id") or settings.google_client_id,
        client_secret=data.get("client_secret") or settings.google_client_secret,
        scopes=data.get("scopes") or SCOPES,
        expiry=expiry,
    )


async def load_credentials(db: AsyncIOMotorDatabase, settings: Settings) -> Credentials | None:
    doc = await db["settings"].find_one({"_id": SETTINGS_ID})
    if not doc or not doc.get("refresh_token"):
        return None
    return credentials_from_dict(doc, settings)


async def save_credentials(db: AsyncIOMotorDatabase, creds: Credentials) -> None:
    payload = credentials_to_dict(creds)
    payload["_id"] = SETTINGS_ID
    await db["settings"].update_one({"_id": SETTINGS_ID}, {"$set": payload}, upsert=True)


def refresh_if_needed(creds: Credentials) -> Credentials:
    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    return creds


async def get_valid_credentials(
    db: AsyncIOMotorDatabase,
    settings: Settings,
) -> Credentials | None:
    creds = await load_credentials(db, settings)
    if not creds:
        return None
    refreshed = await asyncio.to_thread(refresh_if_needed, creds)
    if refreshed.token != creds.token or (refreshed.expiry != creds.expiry):
        await save_credentials(db, refreshed)
    return refreshed if refreshed.valid else None


async def store_oauth_state(db: AsyncIOMotorDatabase, state: str) -> None:
    await db["settings"].update_one(
        {"_id": STATE_ID},
        {"$set": {"state": state, "created_at": datetime.now(UTC)}},
        upsert=True,
    )


async def pop_oauth_state(db: AsyncIOMotorDatabase, state: str) -> bool:
    doc = await db["settings"].find_one_and_delete({"_id": STATE_ID})
    return bool(doc and doc.get("state") == state)


async def clear_credentials(db: AsyncIOMotorDatabase) -> None:
    await db["settings"].delete_one({"_id": SETTINGS_ID})
