from typing import Annotated

from fastapi import APIRouter, Header, Query, status

from app.api.deps import CurrentTenant, DbSession, PageParams
from app.schemas.common import Page
from app.schemas.order import OrderCreate, OrderRead, OrderStatusUpdate
from app.services import orders as service
from app.services.idempotency import find_idempotent_response, save_idempotent_response


router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    data: OrderCreate,
    db: DbSession,
    tenant: CurrentTenant,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=255)] = None,
) -> OrderRead:
    cached = find_idempotent_response(db, tenant.id, "POST /orders", idempotency_key)
    if cached:
        return OrderRead.model_validate(cached)
    order = service.create_order(db, tenant.id, data)
    response = OrderRead.model_validate(order)
    save_idempotent_response(
        db,
        tenant_id=tenant.id,
        endpoint="POST /orders",
        key=idempotency_key,
        response_body=response.model_dump(mode="json"),
    )
    db.commit()
    return order


@router.get("", response_model=Page[OrderRead])
def list_orders(
    db: DbSession,
    tenant: CurrentTenant,
    pagination: PageParams,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    sync_status: str | None = None,
    customer_id: str | None = None,
) -> Page[OrderRead]:
    items, total = service.list_orders(
        db,
        tenant.id,
        offset=pagination.offset,
        limit=pagination.page_size,
        status=status_filter,
        sync_status=sync_status,
        customer_id=customer_id,
    )
    return Page(items=items, page=pagination.page, page_size=pagination.page_size, total=total)


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: str, db: DbSession, tenant: CurrentTenant):
    return service.get_order(db, tenant.id, order_id)


@router.put("/{order_id}/status", response_model=OrderRead)
def update_order_status(
    order_id: str, data: OrderStatusUpdate, db: DbSession, tenant: CurrentTenant
):
    order = service.update_order_status(db, tenant.id, order_id, data.status)
    db.commit()
    return order
