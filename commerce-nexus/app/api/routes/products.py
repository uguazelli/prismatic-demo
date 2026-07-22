from typing import Annotated

from fastapi import APIRouter, Header, status

from app.api.deps import CurrentTenant, DbSession, PageParams
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services import products as service
from app.services.idempotency import find_idempotent_response, save_idempotent_response


router = APIRouter(prefix="/products", tags=["products"])


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate,
    db: DbSession,
    tenant: CurrentTenant,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=255)] = None,
) -> ProductRead:
    cached = find_idempotent_response(db, tenant.id, "POST /products", idempotency_key)
    if cached:
        return ProductRead.model_validate(cached)
    product = service.create_product(db, tenant.id, data)
    response = ProductRead.model_validate(product)
    save_idempotent_response(
        db,
        tenant_id=tenant.id,
        endpoint="POST /products",
        key=idempotency_key,
        response_body=response.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(product)
    return product


@router.get("", response_model=Page[ProductRead])
def list_products(
    db: DbSession,
    tenant: CurrentTenant,
    pagination: PageParams,
    search: str | None = None,
    sync_status: str | None = None,
    in_stock: bool | None = None,
) -> Page[ProductRead]:
    items, total = service.list_products(
        db,
        tenant.id,
        offset=pagination.offset,
        limit=pagination.page_size,
        search=search,
        sync_status=sync_status,
        in_stock=in_stock,
    )
    return Page(items=items, page=pagination.page, page_size=pagination.page_size, total=total)


@router.put("/{product_id}", response_model=ProductRead)
def update_product(product_id: str, data: ProductUpdate, db: DbSession, tenant: CurrentTenant):
    product = service.update_product(db, tenant.id, product_id, data)
    db.commit()
    db.refresh(product)
    return product
