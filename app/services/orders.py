from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.events import emit_event
from app.exceptions import NotFoundError, ValidationAppError
from app.models import Customer, Order, OrderItem, Product
from app.schemas.order import OrderCreate, OrderRead


def get_order(db: Session, tenant_id: str, order_id: str) -> Order:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    if order is None:
        raise NotFoundError("Order", order_id)
    return order


def create_order(db: Session, tenant_id: str, data: OrderCreate) -> Order:
    customer = db.scalar(
        select(Customer).where(Customer.id == data.customer_id, Customer.tenant_id == tenant_id)
    )
    if customer is None:
        raise ValidationAppError("customer_id does not belong to the authenticated tenant")

    product_ids = {item.product_id for item in data.items}
    products = {
        product.id: product
        for product in db.scalars(
            select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
        )
    }
    missing = sorted(product_ids - products.keys())
    if missing:
        raise ValidationAppError(
            "One or more products do not belong to the authenticated tenant",
            {"product_ids": missing},
        )

    order = Order(
        tenant_id=tenant_id,
        customer_id=data.customer_id,
        status=data.status,
        total_amount=Decimal("0.00"),
    )
    db.add(order)
    db.flush()
    total = Decimal("0.00")
    for requested_item in data.items:
        product = products[requested_item.product_id]
        if product.stock_quantity < requested_item.quantity:
            raise ValidationAppError(
                f"Insufficient stock for product '{product.sku}'",
                {"available": product.stock_quantity, "requested": requested_item.quantity},
            )
        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=requested_item.quantity,
            unit_price=product.price,
        )
        order.items.append(item)
        total += product.price * requested_item.quantity
    order.total_amount = total
    db.flush()
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="order.created",
        entity_type="order",
        entity_id=order.id,
        payload=OrderRead.model_validate(order).model_dump(mode="json"),
    )
    return order


def update_order_status(db: Session, tenant_id: str, order_id: str, status: str) -> Order:
    order = get_order(db, tenant_id, order_id)
    previous_status = order.status
    order.status = status
    order.sync_status = "pending"
    db.flush()
    payload = OrderRead.model_validate(order).model_dump(mode="json")
    payload["previous_status"] = previous_status
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="order.status_changed",
        entity_type="order",
        entity_id=order.id,
        payload=payload,
    )
    return order


def list_orders(
    db: Session,
    tenant_id: str,
    *,
    offset: int,
    limit: int,
    status: str | None,
    sync_status: str | None,
    customer_id: str | None,
) -> tuple[list[Order], int]:
    filters = [Order.tenant_id == tenant_id]
    if status:
        filters.append(Order.status == status)
    if sync_status:
        filters.append(Order.sync_status == sync_status)
    if customer_id:
        filters.append(Order.customer_id == customer_id)
    total = db.scalar(select(func.count()).select_from(Order).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Order)
            .options(selectinload(Order.items))
            .where(*filters)
            .order_by(Order.created_at.desc(), Order.id)
            .offset(offset)
            .limit(limit)
        )
    )
    return items, total
