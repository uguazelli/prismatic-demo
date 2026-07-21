from app.schemas.common import Page
from app.schemas.customer import CustomerCreate, CustomerRead, CustomerUpdate
from app.schemas.event import IntegrationEventRead
from app.schemas.order import OrderCreate, OrderItemCreate, OrderItemRead, OrderRead, OrderStatusUpdate
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.schemas.tenant import TenantCreate, TenantCreated, TenantRead
from app.schemas.webhook import OdooWebhook, WebhookResult

__all__ = [
    "CustomerCreate", "CustomerRead", "CustomerUpdate", "IntegrationEventRead",
    "OdooWebhook", "OrderCreate", "OrderItemCreate", "OrderItemRead", "OrderRead",
    "OrderStatusUpdate", "Page", "ProductCreate", "ProductRead", "ProductUpdate",
    "TenantCreate", "TenantCreated", "TenantRead", "WebhookResult",
]
