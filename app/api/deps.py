from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.api_key import api_keys_match, hash_api_key
from app.config import settings
from app.database import get_db
from app.exceptions import AuthenticationError
from app.models import Tenant, TenantApiKey


DbSession = Annotated[Session, Depends(get_db)]
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_current_tenant(
    db: DbSession,
    x_api_key: Annotated[str | None, Depends(api_key_header)],
) -> Tenant:
    if not x_api_key:
        raise AuthenticationError()
    key = db.scalar(select(TenantApiKey).where(TenantApiKey.key_hash == hash_api_key(x_api_key)))
    if key is None:
        raise AuthenticationError()
    tenant = db.get(Tenant, key.tenant_id)
    if tenant is None:
        raise AuthenticationError()
    return tenant


def require_admin_api_key(
    x_api_key: Annotated[str | None, Depends(api_key_header)],
) -> None:
    if not x_api_key or not api_keys_match(x_api_key, settings.admin_api_key):
        raise AuthenticationError("A valid administrative X-API-Key header is required")


CurrentTenant = Annotated[Tenant, Depends(get_current_tenant)]
AdminAuth = Annotated[None, Depends(require_admin_api_key)]


class Pagination:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size


PageParams = Annotated[Pagination, Depends()]
