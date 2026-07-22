from typing import Annotated

from fastapi import APIRouter, Header, status
from sqlalchemy import func, select

from app.api.deps import AdminAuth, DbSession, PageParams
from app.auth.api_key import generate_api_key, hash_api_key
from app.models import Tenant, TenantApiKey
from app.schemas.common import Page
from app.schemas.tenant import TenantCreate, TenantCreated, TenantRead


router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("", response_model=TenantCreated, status_code=status.HTTP_201_CREATED)
def create_tenant(data: TenantCreate, db: DbSession, _: AdminAuth) -> TenantCreated:
    raw_api_key = data.api_key or generate_api_key()
    tenant = Tenant(
        name=data.name,
        external_odoo_instance_id=data.external_odoo_instance_id,
    )
    db.add(tenant)
    db.flush()
    db.add(TenantApiKey(tenant_id=tenant.id, key_hash=hash_api_key(raw_api_key)))
    db.commit()
    db.refresh(tenant)
    return TenantCreated(
        **TenantRead.model_validate(tenant).model_dump(),
        api_key=raw_api_key,
    )


@router.get("", response_model=Page[TenantRead])
def list_tenants(
    db: DbSession,
    _: AdminAuth,
    pagination: PageParams,
    name: str | None = None,
) -> Page[TenantRead]:
    filters = []
    if name:
        filters.append(Tenant.name.ilike(f"%{name}%"))
    total = db.scalar(select(func.count()).select_from(Tenant).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Tenant)
            .where(*filters)
            .order_by(Tenant.created_at.desc(), Tenant.id)
            .offset(pagination.offset)
            .limit(pagination.page_size)
        )
    )
    return Page(items=items, page=pagination.page, page_size=pagination.page_size, total=total)
