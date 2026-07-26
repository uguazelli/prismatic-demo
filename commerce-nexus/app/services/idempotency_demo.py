from datetime import UTC, datetime
from typing import Literal

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events.dispatcher import send_event_request
from app.exceptions import AppError, NotFoundError, ValidationAppError
from app.models import IntegrationEvent
from app.schemas.customer import CustomerCreate
from app.schemas.idempotency_demo import DemoDeliveryResult, DemoPreparedEvent
from app.schemas.product import ProductCreate
from app.services import customers, products
from app.services.system_settings import get_prismatic_api_key, get_prismatic_webhook_url


def _prepared_event(
    db: Session,
    tenant_id: str,
    entity_type: Literal["customer", "product"],
    entity_id: str,
) -> DemoPreparedEvent:
    db.flush()
    event = db.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.tenant_id == tenant_id,
            IntegrationEvent.entity_type == entity_type,
            IntegrationEvent.entity_id == entity_id,
            IntegrationEvent.status == "dispatched",
        )
    )
    if event is None:
        raise NotFoundError("Prepared integration event", entity_id)
    db.commit()
    return DemoPreparedEvent(
        entity_type=entity_type,
        entity_id=entity_id,
        event_id=event.id,
        event_type=event.event_type,
    )


def prepare_customer(
    db: Session,
    tenant_id: str,
    data: CustomerCreate,
) -> DemoPreparedEvent:
    customer = customers.create_customer(
        db,
        tenant_id,
        data,
        event_status="dispatched",
    )
    return _prepared_event(db, tenant_id, "customer", customer.id)


def prepare_product(
    db: Session,
    tenant_id: str,
    data: ProductCreate,
) -> DemoPreparedEvent:
    product = products.create_product(
        db,
        tenant_id,
        data,
        event_status="dispatched",
    )
    return _prepared_event(db, tenant_id, "product", product.id)


def deliver_event(
    db: Session,
    tenant_id: str,
    event_id: str,
) -> DemoDeliveryResult:
    event = db.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.id == event_id,
            IntegrationEvent.tenant_id == tenant_id,
        )
    )
    if event is None:
        raise NotFoundError("Integration event", event_id)

    webhook_url = get_prismatic_webhook_url(db)
    if not webhook_url:
        raise ValidationAppError(
            "Configure the Prismatic webhook URL before running the idempotency demo"
        )

    event.last_attempted_at = datetime.now(UTC)
    db.commit()

    try:
        response = send_event_request(
            event,
            webhook_url=webhook_url,
            api_key=get_prismatic_api_key(db),
            synchronous=True,
        )
    except httpx.HTTPError as error:
        raise AppError(
            502,
            "prismatic_delivery_failed",
            "The demo event could not be delivered to Prismatic",
            str(error),
        ) from error

    try:
        response_data = response.json()
    except ValueError:
        response_data = {"raw": response.text}

    execution_id = response_data.get("executionId") if isinstance(response_data, dict) else None
    return DemoDeliveryResult(
        event_id=event.id,
        status_code=response.status_code,
        execution_id=execution_id,
        response=response_data,
    )
