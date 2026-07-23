from datetime import datetime

from app.schemas.common import ApiSchema


class PrismaticEmbeddedToken(ApiSchema):
    token: str
    expires_at: datetime
    prismatic_url: str
    integration_name: str
