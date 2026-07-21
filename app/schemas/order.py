from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ApiSchema


class OrderItemCreate(ApiSchema):
    product_id: str
    quantity: int = Field(gt=0)


class OrderCreate(ApiSchema):
    customer_id: str
    status: str = Field(default="draft", min_length=1, max_length=50)
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderStatusUpdate(ApiSchema):
    status: str = Field(min_length=1, max_length=50)


class OrderItemRead(ApiSchema):
    id: str
    order_id: str
    product_id: str
    quantity: int
    unit_price: Decimal


class OrderRead(ApiSchema):
    id: str
    tenant_id: str
    customer_id: str
    status: str
    total_amount: Decimal
    external_id: str | None
    sync_status: str
    invoice_status: str | None
    payment_status: str | None
    delivery_status: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemRead]
