import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import IntegrationEvent


from app.services.system_settings import get_prismatic_webhook_url


logger = logging.getLogger("app.prismatic")
CUSTOMER_EVENT_TYPES = ("customer.created", "customer.updated")


def _event_envelope(event: IntegrationEvent) -> dict[str, Any]:
    return {
        "event_id": event.id,
        "event_type": event.event_type,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "tenant_id": event.tenant_id,
        "occurred_at": event.created_at.isoformat(),
        "payload": event.payload,
    }


def dispatch_event(
    db: Session,
    event: IntegrationEvent,
    *,
    client: httpx.Client | None = None,
    webhook_url: str | None = None,
    api_key: str | None = None,
    max_attempts: int | None = None,
) -> bool:
    """Attempt one Prismatic delivery and persist the outcome."""
    webhook_url = webhook_url or get_prismatic_webhook_url(db)
    configured_key = settings.prismatic_api_key
    api_key = api_key or (configured_key.get_secret_value() if configured_key else None)
    max_attempts = max_attempts or settings.prismatic_dispatch_max_attempts
    if not webhook_url or not api_key:
        return False

    owns_client = client is None
    if client is None:
        client = httpx.Client(
            follow_redirects=True,
            timeout=settings.prismatic_webhook_timeout_seconds,
        )

    attempted_at = datetime.now(UTC)
    try:
        response = client.post(
            webhook_url,
            headers={
                "api-key": api_key,
                "Idempotency-Key": event.id,
                "prismatic-synchronous": "false",
            },
            json=_event_envelope(event),
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        event.retry_count += 1
        event.last_attempted_at = attempted_at
        event.last_error = str(exc)[:2000]
        if event.retry_count >= max_attempts:
            event.status = "failed"
            event.processed_at = attempted_at
            event.next_attempt_at = None
        else:
            event.status = "pending"
            backoff_seconds = settings.prismatic_dispatch_interval_seconds * (
                2 ** (event.retry_count - 1)
            )
            event.next_attempt_at = attempted_at + timedelta(seconds=backoff_seconds)
        db.commit()
        logger.warning(
            "prismatic_dispatch_failed",
            extra={
                "event_id": event.id,
                "event_type": event.event_type,
                "attempt": event.retry_count,
                "max_attempts": max_attempts,
            },
        )
        return False
    finally:
        if owns_client:
            client.close()

    event.status = "dispatched"
    event.last_attempted_at = attempted_at
    event.next_attempt_at = None
    event.last_error = None
    db.commit()

    execution_id = None
    try:
        execution_id = response.json().get("executionId")
    except (ValueError, AttributeError):
        pass
    logger.info(
        "prismatic_event_dispatched",
        extra={
            "event_id": event.id,
            "event_type": event.event_type,
            "prismatic_execution_id": execution_id,
        },
    )
    return True


def dispatch_pending_events() -> int:
    """Dispatch one configured batch of due customer events."""
    now = datetime.now(UTC)
    with SessionLocal() as db:
        events = list(
            db.scalars(
                select(IntegrationEvent)
                .where(
                    IntegrationEvent.status == "pending",
                    IntegrationEvent.event_type.in_(CUSTOMER_EVENT_TYPES),
                    or_(
                        IntegrationEvent.next_attempt_at.is_(None),
                        IntegrationEvent.next_attempt_at <= now,
                    ),
                )
                .order_by(IntegrationEvent.created_at, IntegrationEvent.id)
                .limit(settings.prismatic_dispatch_batch_size)
            )
        )
        delivered = 0
        for event in events:
            delivered += int(dispatch_event(db, event))
        return delivered
