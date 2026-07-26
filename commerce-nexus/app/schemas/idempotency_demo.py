from typing import Any, Literal

from app.schemas.common import ApiSchema


class DemoPreparedEvent(ApiSchema):
    entity_type: Literal["customer", "product"]
    entity_id: str
    event_id: str
    event_type: str


class DemoDeliveryResult(ApiSchema):
    event_id: str
    status_code: int
    execution_id: str | None = None
    response: Any
