from typing import Annotated

from fastapi import APIRouter, Header, status

from app.api.deps import CurrentTenant, DbSession, PageParams
from app.schemas.common import Page
from app.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate
from app.services import customers as service
from app.services.idempotency import find_idempotent_response, save_idempotent_response


router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(
    data: CustomerCreate,
    db: DbSession,
    tenant: CurrentTenant,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=255)] = None,
) -> CustomerRead:
    cached = find_idempotent_response(db, tenant.id, "POST /customers", idempotency_key)
    if cached:
        return CustomerRead.model_validate(cached)
    customer = service.create_customer(db, tenant.id, data)
    response = CustomerRead.model_validate(customer)
    save_idempotent_response(
        db,
        tenant_id=tenant.id,
        endpoint="POST /customers",
        key=idempotency_key,
        response_body=response.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=Page[CustomerRead])
def list_customers(
    db: DbSession,
    tenant: CurrentTenant,
    pagination: PageParams,
    search: str | None = None,
    sync_status: str | None = None,
) -> Page[CustomerRead]:
    items, total = service.list_customers(
        db,
        tenant.id,
        offset=pagination.offset,
        limit=pagination.page_size,
        search=search,
        sync_status=sync_status,
    )
    return Page(items=items, page=pagination.page, page_size=pagination.page_size, total=total)


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(customer_id: str, db: DbSession, tenant: CurrentTenant):
    return service.get_customer(db, tenant.id, customer_id)


@router.put("/{customer_id}", response_model=CustomerRead)
def update_customer(
    customer_id: str, data: CustomerUpdate, db: DbSession, tenant: CurrentTenant
):
    customer = service.update_customer(db, tenant.id, customer_id, data)
    db.commit()
    db.refresh(customer)
    return customer
