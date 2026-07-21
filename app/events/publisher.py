from typing import Any

from sqlalchemy.orm import Session

from app.models import IntegrationEvent


def emit_event(
    db: Session,
    *,
    tenant_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any],
    status: str = "pending",
) -> IntegrationEvent:
    event = IntegrationEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        status=status,
    )
    db.add(event)
    return event
