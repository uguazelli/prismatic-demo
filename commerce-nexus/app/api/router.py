from fastapi import APIRouter

from app.api.routes import customers, integration_events, orders, products, tenants, webhooks


api_router = APIRouter()
api_router.include_router(tenants.router)
api_router.include_router(customers.router)
api_router.include_router(products.router)
api_router.include_router(orders.router)
api_router.include_router(integration_events.router)
api_router.include_router(webhooks.router)
