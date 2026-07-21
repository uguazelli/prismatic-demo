from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events import emit_event
from app.exceptions import NotFoundError
from app.models import Customer, IntegrationEvent, Order, Product
from app.schemas.webhook import OdooWebhook


ENTITY_MODELS = {"customer": Customer, "product": Product, "order": Order}


def process_odoo_webhook(db: Session, tenant_id: str, data: OdooWebhook):
    model = ENTITY_MODELS[data.entity_type]
    query = select(model).where(model.tenant_id == tenant_id)
    if data.entity_id:
        query = query.where(model.id == data.entity_id)
    else:
        query = query.where(model.external_id == data.external_id)
    entity = db.scalar(query)
    if entity is None:
        raise NotFoundError(data.entity_type.title(), data.entity_id or data.external_id or "unknown")

    if data.external_id:
        entity.external_id = data.external_id
    if data.synchronization_error:
        entity.sync_status = "failed"
    elif data.synchronization_result:
        entity.sync_status = data.synchronization_result

    if isinstance(entity, Order):
        if data.invoice_status is not None:
            entity.invoice_status = data.invoice_status
        if data.payment_status is not None:
            entity.payment_status = data.payment_status
        if data.delivery_status is not None:
            entity.delivery_status = data.delivery_status

    db.flush()
    completed_at = datetime.now(UTC)
    source_event = db.scalar(
        select(IntegrationEvent)
        .where(
            IntegrationEvent.tenant_id == tenant_id,
            IntegrationEvent.entity_type == data.entity_type,
            IntegrationEvent.entity_id == entity.id,
            IntegrationEvent.status == "pending",
        )
        .order_by(IntegrationEvent.created_at.desc(), IntegrationEvent.id.desc())
        .limit(1)
    )
    if source_event:
        source_event.status = "failed" if entity.sync_status == "failed" else "processed"
        source_event.processed_at = completed_at
    event = emit_event(
        db,
        tenant_id=tenant_id,
        event_type="odoo.webhook.received",
        entity_type=data.entity_type,
        entity_id=entity.id,
        payload=data.model_dump(mode="json"),
        status="processed" if entity.sync_status != "failed" else "failed",
    )
    event.processed_at = completed_at
    return entity


def retry_event(db: Session, tenant_id: str, event_id: str) -> IntegrationEvent:
    event = db.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.id == event_id, IntegrationEvent.tenant_id == tenant_id
        )
    )
    if event is None:
        raise NotFoundError("Integration event", event_id)
    event.status = "pending"
    event.retry_count += 1
    event.processed_at = None
    return event
