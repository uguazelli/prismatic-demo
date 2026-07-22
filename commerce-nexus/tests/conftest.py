import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Base


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with testing_session() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(db_session: Session):
    def override_get_db():
        yield db_session

    original_webhook_url = settings.prismatic_webhook_url
    original_api_key = settings.prismatic_api_key
    settings.prismatic_webhook_url = None
    settings.prismatic_api_key = None
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        settings.prismatic_webhook_url = original_webhook_url
        settings.prismatic_api_key = original_api_key


@pytest.fixture()
def tenants(client: TestClient):
    result = []
    for name, key in (("Tenant A", "tenant-a-secret-key"), ("Tenant B", "tenant-b-secret-key")):
        response = client.post(
            "/tenants",
            headers={"X-API-Key": "change-me-admin-key"},
            json={"name": name, "api_key": key},
        )
        assert response.status_code == 201
        result.append({"id": response.json()["id"], "key": key})
    return result


def auth(key: str, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"X-API-Key": key}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


@pytest.fixture()
def catalog(client: TestClient, tenants):
    tenant = tenants[0]
    customer = client.post(
        "/customers",
        headers=auth(tenant["key"]),
        json={"name": "Buyer", "email": "buyer@example.com", "phone": "+1-555-0100"},
    ).json()
    products = []
    for sku, price, stock in (("WIDGET", "12.50", 10), ("GADGET", "5.25", 20)):
        products.append(
            client.post(
                "/products",
                headers=auth(tenant["key"]),
                json={"sku": sku, "name": sku.title(), "price": price, "stock_quantity": stock},
            ).json()
        )
    return {"tenant": tenant, "customer": customer, "products": products}
