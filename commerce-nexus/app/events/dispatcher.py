import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import IntegrationEvent


from app.services.system_settings import get_prismatic_api_key, get_prismatic_webhook_url


logger = logging.getLogger("app.prismatic")
OUTBOUND_EVENT_TYPES = (
    "customer.created",
    "customer.updated",
    "customer.deleted",
    "product.created",
    "product.updated",
    "product.deleted",
    "order.created",
    "order.status_changed",
    "order.deleted",
)


def _derive_action(event_type: str) -> str:
    if event_type.endswith(".created"):
        return "create"
    if event_type.endswith(".updated") or event_type.endswith(".status_changed"):
        return "update"
    if event_type.endswith(".deleted"):
        return "delete"
    parts = event_type.split(".")
    return parts[-1] if len(parts) > 1 else event_type


def _event_envelope(event: IntegrationEvent) -> dict[str, Any]:
    action = _derive_action(event.event_type)
    envelope = {
        "action": action,
        "event_id": event.id,
        "event_type": event.event_type,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "tenant_id": event.tenant_id,
        "occurred_at": event.created_at.isoformat(),
    }
    if isinstance(event.payload, dict):
        for key, value in event.payload.items():
            if key not in envelope:
                envelope[key] = value
    return envelope


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
    api_key = api_key or get_prismatic_api_key(db)
    max_attempts = max_attempts or settings.prismatic_dispatch_max_attempts
    if not webhook_url:
        return False

    headers = {
        "Idempotency-Key": event.id,
        "prismatic-synchronous": "false",
    }
    if api_key:
        headers["api-key"] = api_key

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
            headers=headers,
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
    """Dispatch one configured batch of due customer, product, and order events."""
    now = datetime.now(UTC)
    with SessionLocal() as db:
        webhook_url = get_prismatic_webhook_url(db)
        if not webhook_url:
            return 0
        events = list(
            db.scalars(
                select(IntegrationEvent)
                .where(
                    IntegrationEvent.status == "pending",
                    IntegrationEvent.event_type.in_(OUTBOUND_EVENT_TYPES),
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

