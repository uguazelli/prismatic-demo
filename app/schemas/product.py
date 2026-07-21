from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ApiSchema


class ProductCreate(ApiSchema):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    price: Decimal = Field(ge=0, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0)


class ProductUpdate(ApiSchema):
    sku: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    stock_quantity: int | None = Field(default=None, ge=0)


class ProductRead(ApiSchema):
    id: str
    tenant_id: str
    sku: str
    name: str
    price: Decimal
    stock_quantity: int
    external_id: str | None
    sync_status: str
    updated_at: datetime
