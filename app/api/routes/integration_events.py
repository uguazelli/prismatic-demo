from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentTenant, DbSession, PageParams
from app.models import IntegrationEvent
from app.schemas.common import Page
from app.schemas.event import IntegrationEventRead
from app.services.webhooks import retry_event


router = APIRouter(prefix="/integration-events", tags=["integration-events"])


@router.get("", response_model=Page[IntegrationEventRead])
def list_integration_events(
    db: DbSession,
    tenant: CurrentTenant,
    pagination: PageParams,
    status: str | None = None,
    event_type: str | None = None,
    entity_type: str | None = None,
) -> Page[IntegrationEventRead]:
    filters = [IntegrationEvent.tenant_id == tenant.id]
    if status:
        filters.append(IntegrationEvent.status == status)
    if event_type:
        filters.append(IntegrationEvent.event_type == event_type)
    if entity_type:
        filters.append(IntegrationEvent.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(IntegrationEvent).where(*filters)) or 0
    items = list(
        db.scalars(
            select(IntegrationEvent)
            .where(*filters)
            .order_by(IntegrationEvent.created_at.desc(), IntegrationEvent.id)
            .offset(pagination.offset)
            .limit(pagination.page_size)
        )
    )
    return Page(items=items, page=pagination.page, page_size=pagination.page_size, total=total)


@router.post("/{event_id}/retry", response_model=IntegrationEventRead)
def retry_integration_event(event_id: str, db: DbSession, tenant: CurrentTenant):
    event = retry_event(db, tenant.id, event_id)
    db.commit()
    db.refresh(event)
    return event
