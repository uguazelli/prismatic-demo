from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiSchema


class TenantCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    external_odoo_instance_id: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, min_length=16, max_length=255)


class TenantRead(ApiSchema):
    id: str
    name: str
    external_odoo_instance_id: str | None
    created_at: datetime


class TenantCreated(TenantRead):
    api_key: str
