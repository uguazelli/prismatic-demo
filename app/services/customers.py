from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.events import emit_event
from app.exceptions import NotFoundError
from app.models import Customer
from app.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate


def get_customer(db: Session, tenant_id: str, customer_id: str) -> Customer:
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )
    if customer is None:
        raise NotFoundError("Customer", customer_id)
    return customer


def create_customer(db: Session, tenant_id: str, data: CustomerCreate) -> Customer:
    customer = Customer(tenant_id=tenant_id, **data.model_dump())
    db.add(customer)
    db.flush()
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="customer.created",
        entity_type="customer",
        entity_id=customer.id,
        payload=CustomerRead.model_validate(customer).model_dump(mode="json"),
    )
    return customer


def update_customer(
    db: Session, tenant_id: str, customer_id: str, data: CustomerUpdate
) -> Customer:
    customer = get_customer(db, tenant_id, customer_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    customer.sync_status = "pending"
    db.flush()
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="customer.updated",
        entity_type="customer",
        entity_id=customer.id,
        payload=CustomerRead.model_validate(customer).model_dump(mode="json"),
    )
    return customer


def list_customers(
    db: Session,
    tenant_id: str,
    *,
    offset: int,
    limit: int,
    search: str | None,
    sync_status: str | None,
) -> tuple[list[Customer], int]:
    filters = [Customer.tenant_id == tenant_id]
    if search:
        term = f"%{search}%"
        filters.append(or_(Customer.name.ilike(term), Customer.email.ilike(term)))
    if sync_status:
        filters.append(Customer.sync_status == sync_status)
    total = db.scalar(select(func.count()).select_from(Customer).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Customer)
            .where(*filters)
            .order_by(Customer.updated_at.desc(), Customer.id)
            .offset(offset)
            .limit(limit)
        )
    )
    return items, total
