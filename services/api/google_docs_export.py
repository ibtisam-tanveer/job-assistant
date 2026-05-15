"""Create or update Google Docs from plain text."""

from __future__ import annotations

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def doc_edit_url(doc_id: str) -> str:
    return f"https://docs.google.com/document/d/{doc_id}/edit"


def _document_end_index(document: dict) -> int:
    end_index = 1
    for block in document.get("body", {}).get("content", []):
        if "endIndex" in block:
            end_index = max(end_index, int(block["endIndex"]))
    return max(1, end_index - 1)


def create_document(service: object, title: str, text: str) -> str:
    doc = service.documents().create(body={"title": title}).execute()  # type: ignore[union-attr]
    doc_id = str(doc["documentId"])
    body = (text or "").strip()
    if body:
        service.documents().batchUpdate(  # type: ignore[union-attr]
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": 1}, "text": body}}]},
        ).execute()
    return doc_id


def replace_document_text(service: object, doc_id: str, text: str) -> None:
    document = service.documents().get(documentId=doc_id).execute()  # type: ignore[union-attr]
    end_index = _document_end_index(document)
    requests: list[dict] = []
    if end_index > 1:
        requests.append(
            {
                "deleteContentRange": {
                    "range": {"startIndex": 1, "endIndex": end_index},
                }
            }
        )
    body = (text or "").strip()
    if body:
        requests.append({"insertText": {"location": {"index": 1}, "text": body}})
    if requests:
        service.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()  # type: ignore[union-attr]


def create_or_update_document(
    creds: Credentials,
    doc_id: str | None,
    title: str,
    text: str,
) -> tuple[str, str]:
    service = build("docs", "v1", credentials=creds, cache_discovery=False)
    if doc_id:
        replace_document_text(service, doc_id, text)
        return doc_id, doc_edit_url(doc_id)
    new_id = create_document(service, title, text)
    return new_id, doc_edit_url(new_id)
