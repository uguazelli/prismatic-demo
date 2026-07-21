from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.events import emit_event
from app.exceptions import ConflictError, NotFoundError
from app.models import Product
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate


def get_product(db: Session, tenant_id: str, product_id: str) -> Product:
    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)
    )
    if product is None:
        raise NotFoundError("Product", product_id)
    return product


def _ensure_unique_sku(
    db: Session, tenant_id: str, sku: str, excluding_id: str | None = None
) -> None:
    query = select(Product.id).where(Product.tenant_id == tenant_id, Product.sku == sku)
    if excluding_id:
        query = query.where(Product.id != excluding_id)
    if db.scalar(query):
        raise ConflictError(f"Product SKU '{sku}' already exists for this tenant")


def create_product(db: Session, tenant_id: str, data: ProductCreate) -> Product:
    _ensure_unique_sku(db, tenant_id, data.sku)
    product = Product(tenant_id=tenant_id, **data.model_dump())
    db.add(product)
    db.flush()
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="product.created",
        entity_type="product",
        entity_id=product.id,
        payload=ProductRead.model_validate(product).model_dump(mode="json"),
    )
    return product


def update_product(db: Session, tenant_id: str, product_id: str, data: ProductUpdate) -> Product:
    product = get_product(db, tenant_id, product_id)
    changes = data.model_dump(exclude_unset=True)
    if "sku" in changes:
        _ensure_unique_sku(db, tenant_id, changes["sku"], product.id)
    for field, value in changes.items():
        setattr(product, field, value)
    product.sync_status = "pending"
    db.flush()
    emit_event(
        db,
        tenant_id=tenant_id,
        event_type="product.updated",
        entity_type="product",
        entity_id=product.id,
        payload=ProductRead.model_validate(product).model_dump(mode="json"),
    )
    return product


def list_products(
    db: Session,
    tenant_id: str,
    *,
    offset: int,
    limit: int,
    search: str | None,
    sync_status: str | None,
    in_stock: bool | None,
) -> tuple[list[Product], int]:
    filters = [Product.tenant_id == tenant_id]
    if search:
        term = f"%{search}%"
        filters.append(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    if sync_status:
        filters.append(Product.sync_status == sync_status)
    if in_stock is True:
        filters.append(Product.stock_quantity > 0)
    elif in_stock is False:
        filters.append(Product.stock_quantity == 0)
    total = db.scalar(select(func.count()).select_from(Product).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Product)
            .where(*filters)
            .order_by(Product.updated_at.desc(), Product.id)
            .offset(offset)
            .limit(limit)
        )
    )
    return items, total
