import binascii
from datetime import UTC, datetime
import time

import jwt
from fastapi import APIRouter
from jwt.exceptions import InvalidKeyError

from app.api.deps import CurrentTenant
from app.config import settings
from app.exceptions import AppError
from app.schemas.integration import PrismaticEmbeddedToken


router = APIRouter(prefix="/integrations", tags=["integrations"])


def _embedded_configuration_error(message: str) -> AppError:
    return AppError(
        503,
        "prismatic_embedded_not_configured",
        message,
    )


@router.post("/prismatic/embedded-token", response_model=PrismaticEmbeddedToken)
def create_prismatic_embedded_token(tenant: CurrentTenant) -> PrismaticEmbeddedToken:
    if not settings.prismatic_organization_id:
        raise _embedded_configuration_error(
            "PRISMATIC_ORGANIZATION_ID must be configured before connecting Odoo"
        )

    try:
        signing_key = settings.prismatic_signing_key
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise _embedded_configuration_error(
            "PRISMATIC_EMBEDDED_SIGNING_KEY_BASE64 is invalid"
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
        "organization": settings.prismatic_organization_id,
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

    return PrismaticEmbeddedToken(
        token=token,
        expires_at=datetime.fromtimestamp(expires_at, tz=UTC),
        prismatic_url=settings.prismatic_url.rstrip("/"),
        integration_name=settings.prismatic_integration_name,
    )
