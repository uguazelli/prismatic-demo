from fastapi import APIRouter, status

from app.api.deps import CurrentTenant, DbSession
from app.schemas.customer import CustomerCreate
from app.schemas.idempotency_demo import DemoDeliveryResult, DemoPreparedEvent
from app.schemas.product import ProductCreate
from app.services import idempotency_demo


router = APIRouter(prefix="/demo/idempotency", tags=["idempotency-demo"])


@router.post(
    "/customers",
    response_model=DemoPreparedEvent,
    status_code=status.HTTP_201_CREATED,
)
def prepare_customer_demo(
    data: CustomerCreate,
    db: DbSession,
    tenant: CurrentTenant,
) -> DemoPreparedEvent:
    return idempotency_demo.prepare_customer(db, tenant.id, data)


@router.post(
    "/products",
    response_model=DemoPreparedEvent,
    status_code=status.HTTP_201_CREATED,
)
def prepare_product_demo(
    data: ProductCreate,
    db: DbSession,
    tenant: CurrentTenant,
) -> DemoPreparedEvent:
    return idempotency_demo.prepare_product(db, tenant.id, data)


@router.post(
    "/events/{event_id}/deliver",
    response_model=DemoDeliveryResult,
)
def deliver_demo_event(
    event_id: str,
    db: DbSession,
    tenant: CurrentTenant,
) -> DemoDeliveryResult:
    return idempotency_demo.deliver_event(db, tenant.id, event_id)
