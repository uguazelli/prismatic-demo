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
    assert captured["body"]["action"] == "create"
    assert captured["body"]["email"] == "grace@example.com"
    assert captured["body"]["name"] == "Grace Buyer"


def test_customer_update_event_dispatches_flat_payload(
    client: TestClient, tenants, db_session: Session
):
    tenant = tenants[0]
    created = client.post(
        "/customers",
        headers=auth(tenant["key"]),
        json={"name": "Old Name", "email": "buyer@northwind.example", "phone": "+1-555-0000"},
    ).json()

    updated = client.put(
        f"/customers/{created['id']}",
        headers=auth(tenant["key"]),
        json={"name": "Northwind Buyer Inc", "phone": "+1-555-0101"},
    )
    assert updated.status_code == 200

    event = db_session.scalar(
        select(IntegrationEvent)
        .where(
            IntegrationEvent.entity_id == created["id"],
            IntegrationEvent.event_type == "customer.updated",
        )
    )
    assert event is not None
    event.payload["external_id"] = "abc"

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"executionId": "execution-456"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as webhook_client:
        delivered = dispatch_event(
            db_session,
            event,
            client=webhook_client,
            webhook_url="https://hooks.prismatic.io/trigger/test",
        )

    assert delivered is True
    assert captured["body"]["event_type"] == "customer.updated"
    assert captured["body"]["action"] == "update"
    assert captured["body"]["id"] == created["id"]
    assert captured["body"]["external_id"] == "abc"
    assert captured["body"]["name"] == "Northwind Buyer Inc"
    assert captured["body"]["email"] == "buyer@northwind.example"
    assert captured["body"]["phone"] == "+1-555-0101"


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


def test_odoo_webhook_updates_customer_by_external_id(client: TestClient, catalog):
    customer = catalog["customer"]
    tenant = catalog["tenant"]

    link_response = client.post(
        "/webhooks/odoo",
        headers=auth(tenant["key"]),
        json={
            "entity_type": "customer",
            "entity_id": customer["id"],
            "external_id": "53",
            "synchronization_result": "success",
        },
    )
    assert link_response.status_code == 200

    update_response = client.post(
        "/webhooks/odoo",
        headers=auth(tenant["key"]),
        json={
            "action": "sync",
            "entity_type": "customer",
            "external_id": "53",
            "name": "Albert Einstein",
            "email": "einstein@acme.com",
            "phone": "+1 438-226-5956",
            "synchronization_result": "success",
        },
    )
    assert update_response.status_code == 200

    fetched = client.get(f"/customers/{customer['id']}", headers=auth(tenant["key"]))
    assert fetched.json()["name"] == "Albert Einstein"
    assert fetched.json()["email"] == "einstein@acme.com"
    assert fetched.json()["phone"] == "+1 438-226-5956"
    assert fetched.json()["external_id"] == "53"
    assert fetched.json()["sync_status"] == "success"


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
    assert body["integration_name"] == "Nexus Odoo Code Native"


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


def test_update_prismatic_settings_signing_key_and_api_key(client: TestClient, tenants):
    response = client.put(
        "/integrations/prismatic/settings",
        headers=auth(tenants[0]["key"]),
        json={
            "prismatic_organization_id": "test-org-id",
            "prismatic_embedded_signing_key": "test-custom-key",
            "prismatic_api_key": "test-custom-api-key",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["prismatic_organization_id"] == "test-org-id"
    assert data["prismatic_embedded_signing_key"] == "test-custom-key"
    assert data["prismatic_api_key"] == "test-custom-api-key"
    assert data["has_signing_key"] is True


def test_delete_customer_product_and_order(client: TestClient, catalog, db_session: Session):
    tenant = catalog["tenant"]
    cust_id = catalog["customer"]["id"]
    prod_id = catalog["products"][0]["id"]

    # Delete customer with existing orders fails
    order_res = client.post(
        "/orders",
        headers=auth(tenant["key"]),
        json={"customer_id": cust_id, "items": [{"product_id": prod_id, "quantity": 1}]},
    )
    order_id = order_res.json()["id"]

    # Delete order succeeds and emits order.deleted
    del_order = client.delete(f"/orders/{order_id}", headers=auth(tenant["key"]))
    assert del_order.status_code == 204
    assert client.get(f"/orders/{order_id}", headers=auth(tenant["key"])).status_code == 404
    del_order_event = db_session.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.entity_id == order_id,
            IntegrationEvent.event_type == "order.deleted",
        )
    )
    assert del_order_event is not None

    # Delete customer succeeds and emits customer.deleted
    del_cust = client.delete(f"/customers/{cust_id}", headers=auth(tenant["key"]))
    assert del_cust.status_code == 204
    assert client.get(f"/customers/{cust_id}", headers=auth(tenant["key"])).status_code == 404
    del_cust_event = db_session.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.entity_id == cust_id,
            IntegrationEvent.event_type == "customer.deleted",
        )
    )
    assert del_cust_event is not None

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"executionId": "del-123"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as webhook_client:
        delivered = dispatch_event(
            db_session,
            del_cust_event,
            client=webhook_client,
            webhook_url="https://hooks.prismatic.io/trigger/test",
        )

    assert delivered is True
    assert captured["body"]["action"] == "delete"
    assert captured["body"]["event_type"] == "customer.deleted"

    # Delete product succeeds and emits product.deleted
    del_prod = client.delete(f"/products/{prod_id}", headers=auth(tenant["key"]))
    assert del_prod.status_code == 204
    del_prod_event = db_session.scalar(
        select(IntegrationEvent).where(
            IntegrationEvent.entity_id == prod_id,
            IntegrationEvent.event_type == "product.deleted",
        )
    )
    assert del_prod_event is not None
