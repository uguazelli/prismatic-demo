from datetime import datetime
from typing import Any

from app.schemas.common import ApiSchema


class IntegrationEventRead(ApiSchema):
    id: str
    tenant_id: str
    event_type: str
    entity_type: str
    entity_id: str
    payload: dict[str, Any]
    status: str
    retry_count: int
    created_at: datetime
    processed_at: datetime | None
