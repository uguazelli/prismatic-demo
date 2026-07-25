import base64
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import SecretStr

from app.config import settings
from app.models import SystemSetting


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if row and row.value is not None:
        return row.value
    val = default if default is not None else getattr(settings, key, None)
    if isinstance(val, SecretStr):
        return val.get_secret_value()
    return val


def set_setting(db: Session, key: str, value: str | None) -> str | None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if not row:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()

    # Sync runtime settings object
    if key == "prismatic_webhook_url":
        settings.prismatic_webhook_url = value
    elif key == "prismatic_organization_id":
        settings.prismatic_organization_id = value
    elif key == "prismatic_integration_name":
        settings.prismatic_integration_name = value
    elif key == "prismatic_url":
        settings.prismatic_url = value
    elif key == "prismatic_api_key":
        settings.prismatic_api_key = SecretStr(value) if value else None
    elif key == "prismatic_embedded_signing_key":
        settings.prismatic_embedded_signing_key = SecretStr(value) if value else None

    return value


def get_prismatic_webhook_url(db: Session) -> str | None:
    return get_setting(db, "prismatic_webhook_url", settings.prismatic_webhook_url)


def set_prismatic_webhook_url(db: Session, url: str) -> str:
    set_setting(db, "prismatic_webhook_url", url)
    return url


def get_prismatic_organization_id(db: Session) -> str | None:
    return get_setting(db, "prismatic_organization_id", settings.prismatic_organization_id)


def set_prismatic_organization_id(db: Session, org_id: str) -> str:
    set_setting(db, "prismatic_organization_id", org_id)
    return org_id


def get_prismatic_signing_key(db: Session) -> str | None:
    db_key = get_setting(db, "prismatic_embedded_signing_key")
    if db_key and db_key.strip():
        val = db_key.strip().replace("\\n", "\n")
        if val.startswith("-----BEGIN"):
            return val
        try:
            return base64.b64decode(val, validate=True).decode("utf-8")
        except Exception:
            return val
    return settings.prismatic_signing_key


def get_prismatic_api_key(db: Session) -> str | None:
    db_key = get_setting(db, "prismatic_api_key")
    if db_key and db_key.strip():
        return db_key.strip()
    return settings.prismatic_api_key.get_secret_value() if settings.prismatic_api_key else None

