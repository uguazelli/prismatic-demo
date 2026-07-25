from typing import Any, Literal

from pydantic import EmailStr, Field, model_validator

from app.schemas.common import ApiSchema


class OdooWebhook(ApiSchema):
    action: Literal["sync", "delete"] | None = None
    event_id: str | None = Field(default=None, max_length=255)
    entity_type: Literal["customer", "product", "order"]
    entity_id: str | None = None
    external_id: str | None = Field(default=None, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    invoice_status: str | None = Field(default=None, max_length=50)
    payment_status: str | None = Field(default=None, max_length=50)
    delivery_status: str | None = Field(default=None, max_length=50)
    synchronization_result: Literal["success", "failed", "pending"] | None = None
    synchronization_error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_identifier(self) -> "OdooWebhook":
        if not self.entity_id and not self.external_id:
            raise ValueError("entity_id or external_id is required")
        return self


class WebhookResult(ApiSchema):
    accepted: bool
    entity_type: str
    entity_id: str
    sync_status: str
