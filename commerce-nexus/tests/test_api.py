import json

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Customer, IntegrationEvent, Order
from app.events.dispatcher import dispatch_event
from tests.conftest import auth


def test_api_key_authentication(client: TestClient):
    missing = client.get("/customers")
    invalid = client.get("/customers", headers=auth("wrong"))
    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert missing.json()["error"]["code"] == "invalid_api_key"


def test_customer_creation_and_event(client: TestClient, tenants, db_session: Session):
    tenant = tenants[0]
    response = client.post(
        "/customers",
        headers=auth(tenant["key"]),
        json={"name": "Ada Buyer", "email": "ada@example.com", "phone": "+1-555-0111"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["sync_status"] == "pending"

    event = db_session.scalar(
        select(IntegrationEvent).where(IntegrationEvent.entity_id == body["id"])
    )
    assert event is not None
    assert event.event_type == "customer.created"
    assert event.payload["email"] == "ada@example.com"


def test_customer_event_is_dispatched_to_prismatic(
    client: TestClient, tenants, db_session: Session
):
    tenant = tenants[0]
    response = client.post(
        "/customers",
        headers=auth(tenant["key"]),
        json={"name": "Grace Buyer", "email": "grace@example.com"},
    )
    event = db_session.scalar(
        select(IntegrationEvent).where(IntegrationEvent.entity_id == response.json()["id"])
    )
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = request.headers
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"executionId": "execution-123"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as webhook_client:
        delivered = dispatch_event(
            db_session,
            event,
            client=webhook_client,
            webhook_url="https://hooks.prismatic.io/trigger/test",
            api_key="test-prismatic-key",
        )

    assert delivered is True
    assert event.status == "dispatched"
    assert event.last_attempted_at is not None
    assert event.last_error is None
    assert captured["headers"]["api-key"] == "test-prismatic-key"
    assert captured["headers"]["idempotency-key"] == event.id
    assert captured["body"]["event_id"] == event.id
    assert captured["body"]["event_type"] == "customer.created"
    assert captured["body"]["payload"]["email"] == "grace@example.com"


def test_failed_prismatic_delivery_can_be_retried(
    client: TestClient, tenants, db_session: Session
):
    response = client.post(
        "/customers",
        headers=auth(tenants[0]["key"]),
        json={"name": "Retry Buyer", "email": "retry@example.com"},
    )
    event = db_session.scalar(
        select(IntegrationEvent).where(IntegrationEvent.entity_id == response.json()["id"])
    )

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="temporarily unavailable")

    with httpx.Client(transport=httpx.MockTransport(handler)) as webhook_client:
        delivered = dispatch_event(
            db_session,
            event,
            client=webhook_client,
            webhook_url="https://hooks.prismatic.io/trigger/test",
            api_key="test-prismatic-key",
            max_attempts=1,
        )

    assert delivered is False
    assert event.status == "failed"
    assert event.retry_count == 1
    assert event.last_error

    retry = client.post(
        f"/integration-events/{event.id}/retry", headers=auth(tenants[0]["key"])
    )
    assert retry.status_code == 200
    assert retry.json()["status"] == "pending"
    assert retry.json()["retry_count"] == 0
    assert retry.json()["last_error"] is None


def test_tenant_isolation(client: TestClient, tenants):
    first, second = tenants
    created = client.post(
        "/customers",
        headers=auth(first["key"]),
        json={"name": "Private Buyer", "email": "private@example.com"},
    ).json()

    assert client.get(f"/customers/{created['id']}", headers=auth(second["key"])).status_code == 404
    second_list = client.get("/customers", headers=auth(second["key"])).json()
    assert second_list["total"] == 0


def test_create_idempotency(client: TestClient, tenants, db_session: Session):
    headers = auth(tenants[0]["key"], "customer-request-123")
    payload = {"name": "Only Once", "email": "once@example.com"}
    first = client.post("/customers", headers=headers, json=payload)
    second = client.post("/customers", headers=headers, json=payload)

    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert db_session.scalar(select(func.count()).select_from(Customer)) == 1
    assert db_session.scalar(select(func.count()).select_from(IntegrationEvent)) == 1


def test_order_creation_and_integration_event(
    client: TestClient, catalog, db_session: Session
):
    payload = {
        "customer_id": catalog["customer"]["id"],
        "items": [
            {"product_id": catalog["products"][0]["id"], "quantity": 2},
            {"product_id": catalog["products"][1]["id"], "quantity": 1},
        ],
    }
    response = client.post(
        "/orders",
        headers=auth(catalog["tenant"]["key"], "order-001"),
        json=payload,
    )
    assert response.status_code == 201
    order = response.json()
    assert order["total_amount"] == "30.25"
    assert len(order["items"]) == 2
    assert db_session.scalar(
        select(func.count()).select_from(IntegrationEvent).where(
            IntegrationEvent.entity_id == order["id"],
            IntegrationEvent.event_type == "order.created",
        )
    ) == 1


def test_cross_tenant_order_references_are_rejected(client: TestClient, catalog, tenants):
    response = client.post(
        "/orders",
        headers=auth(tenants[1]["key"]),
        json={
            "customer_id": catalog["customer"]["id"],
            "items": [{"product_id": catalog["products"][0]["id"], "quantity": 1}],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_odoo_webhook_processing(client: TestClient, catalog, db_session: Session):
    order_response = client.post(
        "/orders",
        headers=auth(catalog["tenant"]["key"]),
        json={
            "customer_id": catalog["customer"]["id"],
            "items": [{"product_id": catalog["products"][0]["id"], "quantity": 1}],
        },
    )
    order_id = order_response.json()["id"]
    webhook = client.post(
        "/webhooks/odoo",
        headers=auth(catalog["tenant"]["key"]),
        json={
            "event_id": db_session.scalar(
                select(IntegrationEvent.id).where(
                    IntegrationEvent.entity_id == order_id,
                    IntegrationEvent.event_type == "order.created",
                )
            ),
            "entity_type": "order",
            "entity_id": order_id,
            "external_id": "ODOO-SO-9001",
            "invoice_status": "invoiced",
            "payment_status": "paid",
            "delivery_status": "delivered",
            "synchronization_result": "success",
            "metadata": {"source": "prismatic"},
        },
    )
    assert webhook.status_code == 200
    assert webhook.json()["sync_status"] == "success"

    fetched = client.get(f"/orders/{order_id}", headers=auth(catalog["tenant"]["key"]))
    assert fetched.json()["external_id"] == "ODOO-SO-9001"
    assert fetched.json()["invoice_status"] == "invoiced"
    assert fetched.json()["payment_status"] == "paid"
    assert fetched.json()["delivery_status"] == "delivered"

    inbound_event = db_session.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.entity_id == order_id,
            IntegrationEvent.event_type == "odoo.webhook.received",
        )
    )
    assert inbound_event is not None
    assert inbound_event.status == "processed"


def test_pagination_and_filters(client: TestClient, tenants):
    key = tenants[0]["key"]
    for index in range(3):
        client.post(
            "/customers",
            headers=auth(key),
            json={"name": f"Buyer {index}", "email": f"buyer{index}@example.com"},
        )
    response = client.get("/customers?page=2&page_size=2&search=Buyer", headers=auth(key))
    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert len(response.json()["items"]) == 1


def test_frontend_index_and_static_files(client: TestClient):
    index_res = client.get("/")
    assert index_res.status_code == 200
    assert "Veridata Commerce Nexus" in index_res.text
    assert "<title>Veridata Commerce Nexus" in index_res.text
    assert 'id="btn-connect-odoo"' in index_res.text
    assert "@prismatic-io/embedded@4.12.1" in index_res.text

    css_res = client.get("/static/css/styles.css")
    assert css_res.status_code == 200
    assert "--bg-primary" in css_res.text

    js_res = client.get("/static/js/app.js")
    assert js_res.status_code == 200
    assert "const App =" in js_res.text
    assert "prismatic.configureInstance" in js_res.text


def test_prismatic_embedded_token_is_tenant_scoped(client: TestClient, tenants):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    original_key = settings.prismatic_embedded_signing_key
    original_base64_key = settings.prismatic_embedded_signing_key_base64
    original_key_file = settings.prismatic_embedded_signing_key_file
    settings.prismatic_embedded_signing_key = SecretStr(private_pem)
    settings.prismatic_embedded_signing_key_base64 = None
    settings.prismatic_embedded_signing_key_file = None

    try:
        response = client.post(
            "/integrations/prismatic/embedded-token",
            headers=auth(tenants[0]["key"]),
        )
    finally:
        settings.prismatic_embedded_signing_key = original_key
        settings.prismatic_embedded_signing_key_base64 = original_base64_key
        settings.prismatic_embedded_signing_key_file = original_key_file

    assert response.status_code == 200
    body = response.json()
    claims = jwt.decode(
        body["token"],
        private_key.public_key(),
        algorithms=["RS256"],
    )
    assert claims["organization"] == settings.prismatic_organization_id
    assert claims["customer"] == tenants[0]["id"]
    assert claims["customer"] != tenants[1]["id"]
    assert claims["role"] == "admin"
    assert body["integration_name"] == "Veridata Commerce Nexus - Odoo"


def test_prismatic_embedded_token_requires_server_signing_key(client: TestClient, tenants):
    original_key = settings.prismatic_embedded_signing_key
    original_base64_key = settings.prismatic_embedded_signing_key_base64
    original_key_file = settings.prismatic_embedded_signing_key_file
    settings.prismatic_embedded_signing_key = None
    settings.prismatic_embedded_signing_key_base64 = None
    settings.prismatic_embedded_signing_key_file = None

    try:
        response = client.post(
            "/integrations/prismatic/embedded-token",
            headers=auth(tenants[0]["key"]),
        )
    finally:
        settings.prismatic_embedded_signing_key = original_key
        settings.prismatic_embedded_signing_key_base64 = original_base64_key
        settings.prismatic_embedded_signing_key_file = original_key_file

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "prismatic_embedded_not_configured"


def test_seed_endpoint(client: TestClient):
    res = client.post("/seed")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
