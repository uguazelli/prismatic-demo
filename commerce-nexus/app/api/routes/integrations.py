import binascii
from datetime import UTC, datetime
import time

import jwt
from fastapi import APIRouter
from jwt.exceptions import InvalidKeyError

from app.api.deps import CurrentTenant, DbSession
from app.config import settings
from app.exceptions import AppError
from app.schemas.integration import (
    PrismaticEmbeddedToken,
    PrismaticSettingsRead,
    PrismaticSettingsUpdate,
)
from app.services.system_settings import (
    get_prismatic_api_key,
    get_prismatic_signing_key,
    get_setting,
    set_setting,
)


router = APIRouter(prefix="/integrations", tags=["integrations"])


def _embedded_configuration_error(message: str) -> AppError:
    return AppError(
        503,
        "prismatic_embedded_not_configured",
        message,
    )


@router.get("/prismatic/settings", response_model=PrismaticSettingsRead)
def get_prismatic_settings(db: DbSession, tenant: CurrentTenant) -> PrismaticSettingsRead:
    signing_key = get_prismatic_signing_key(db)
    api_key = get_prismatic_api_key(db)
    return PrismaticSettingsRead(
        prismatic_organization_id=get_setting(
            db, "prismatic_organization_id", settings.prismatic_organization_id
        ),
        prismatic_webhook_url=get_setting(
            db, "prismatic_webhook_url", settings.prismatic_webhook_url
        ),
        prismatic_integration_name=get_setting(
            db, "prismatic_integration_name", settings.prismatic_integration_name
        ),
        prismatic_url=get_setting(db, "prismatic_url", settings.prismatic_url),
        prismatic_embedded_signing_key=get_setting(db, "prismatic_embedded_signing_key"),
        prismatic_api_key=api_key,
        has_signing_key=bool(signing_key),
    )


@router.put("/prismatic/settings", response_model=PrismaticSettingsRead)
def update_prismatic_settings(
    data: PrismaticSettingsUpdate, db: DbSession, tenant: CurrentTenant
) -> PrismaticSettingsRead:
    if data.prismatic_organization_id is not None:
        set_setting(db, "prismatic_organization_id", data.prismatic_organization_id.strip())
    if data.prismatic_webhook_url is not None:
        set_setting(db, "prismatic_webhook_url", data.prismatic_webhook_url.strip())
    if data.prismatic_integration_name is not None:
        set_setting(db, "prismatic_integration_name", data.prismatic_integration_name.strip())
    if data.prismatic_url is not None:
        set_setting(db, "prismatic_url", data.prismatic_url.strip())
    if data.prismatic_embedded_signing_key is not None:
        set_setting(db, "prismatic_embedded_signing_key", data.prismatic_embedded_signing_key.strip())
    if data.prismatic_api_key is not None:
        set_setting(db, "prismatic_api_key", data.prismatic_api_key.strip())

    return get_prismatic_settings(db, tenant)


@router.post("/prismatic/embedded-token", response_model=PrismaticEmbeddedToken)
def create_prismatic_embedded_token(
    db: DbSession, tenant: CurrentTenant
) -> PrismaticEmbeddedToken:
    organization_id = get_setting(
        db, "prismatic_organization_id", settings.prismatic_organization_id
    )
    if not organization_id:
        raise _embedded_configuration_error(
            "PRISMATIC_ORGANIZATION_ID must be configured before connecting Odoo"
        )

    try:
        signing_key = get_prismatic_signing_key(db)
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise _embedded_configuration_error(
            "PRISMATIC_EMBEDDED_SIGNING_KEY is invalid"
        ) from exc

    if not signing_key:
        raise _embedded_configuration_error(
            "Prismatic embedded signing is not configured. Add an embedded signing key "
            "to the Commerce Nexus server environment."
        )

    now = int(time.time())
    expires_at = now + max(300, settings.prismatic_embedded_token_ttl_seconds)
    user_external_id = f"commerce-nexus-admin-{tenant.id}"
    claims = {
        "sub": user_external_id,
        "external_id": user_external_id,
        "name": f"{tenant.name} Integration Administrator",
        "organization": organization_id,
        "customer": tenant.id,
        "customer_name": tenant.name,
        "role": "admin",
        "iat": now - 30,
        "exp": expires_at,
    }

    try:
        token = jwt.encode(claims, signing_key, algorithm="RS256")
    except (InvalidKeyError, TypeError, ValueError) as exc:
        raise _embedded_configuration_error(
            "The configured Prismatic embedded signing key is not a valid RSA private key"
        ) from exc

    prismatic_url = get_setting(db, "prismatic_url", settings.prismatic_url) or "https://app.prismatic.io"
    integration_name = (
        get_setting(db, "prismatic_integration_name", settings.prismatic_integration_name)
        or "Veridata Commerce Nexus - Odoo"
    )

    return PrismaticEmbeddedToken(
        token=token,
        expires_at=datetime.fromtimestamp(expires_at, tz=UTC),
        prismatic_url=prismatic_url.rstrip("/"),
        integration_name=integration_name,
    )
