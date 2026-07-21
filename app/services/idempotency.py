from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IdempotencyRecord


def find_idempotent_response(
    db: Session, tenant_id: str, endpoint: str, key: str | None
) -> dict[str, Any] | None:
    if not key:
        return None
    record = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.tenant_id == tenant_id,
            IdempotencyRecord.endpoint == endpoint,
            IdempotencyRecord.idempotency_key == key,
        )
    )
    return record.response_body if record else None


def save_idempotent_response(
    db: Session,
    *,
    tenant_id: str,
    endpoint: str,
    key: str | None,
    response_body: dict[str, Any],
    status_code: int = 201,
) -> None:
    if key:
        db.add(
            IdempotencyRecord(
                tenant_id=tenant_id,
                endpoint=endpoint,
                idempotency_key=key,
                response_body=response_body,
                status_code=status_code,
            )
        )
