from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import SecretStr

from app.config import settings
from app.models import SystemSetting


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if row and row.value is not None:
        return row.value
    return default if default is not None else getattr(settings, key, None)


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
