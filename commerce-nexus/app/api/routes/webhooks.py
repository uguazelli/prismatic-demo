from fastapi import APIRouter

from app.api.deps import CurrentTenant, DbSession
from app.schemas.webhook import OdooWebhook, WebhookResult
from app.services.webhooks import process_odoo_webhook


router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/odoo", response_model=WebhookResult)
def odoo_webhook(data: OdooWebhook, db: DbSession, tenant: CurrentTenant) -> WebhookResult:
    entity = process_odoo_webhook(db, tenant.id, data)
    db.commit()
    if entity is not None:
        db.refresh(entity)
        entity_id = entity.id
        sync_status = entity.sync_status
    else:
        entity_id = data.entity_id or "deleted"
        sync_status = "success"
    return WebhookResult(
        accepted=True,
        entity_type=data.entity_type,
        entity_id=entity_id,
        sync_status=sync_status,
    )
