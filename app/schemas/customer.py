from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.common import ApiSchema


class CustomerCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)


class CustomerUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)


class CustomerRead(ApiSchema):
    id: str
    tenant_id: str
    name: str
    email: EmailStr
    phone: str | None
    external_id: str | None
    sync_status: str
    updated_at: datetime
