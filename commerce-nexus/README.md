# Veridata Commerce Nexus

**Connected commerce. Unified operations.**

Veridata Commerce Nexus is a production-style, multi-tenant B2B order-management hub designed to demonstrate an embedded Prismatic integration with Odoo. It includes tenant-scoped customers, products, orders, an integration-event outbox, and a callback endpoint for Odoo results. Prismatic and Odoo themselves are intentionally not included.

## What is included

- Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16, Alembic, uv, and Pytest
- Docker Compose services named `demo-saas-api`, `postgres`, and optional-profile `adminer`
- Per-tenant API keys stored as SHA-256 hashes; an administrative key is used only to provision/list tenants
- Tenant isolation on every business query and relationship validation across customer/product/order references
- `Idempotency-Key` replay protection for customer, product, and order creation
- Transactional integration-event creation for every business create/update
- Structured JSON request logs, request IDs, paginated/filterable lists, and consistent error envelopes
- OpenAPI at `/docs`, ReDoc at `/redoc`, and the schema at `/openapi.json`

The order model also stores `invoice_status`, `payment_status`, and `delivery_status`. These are callback fields needed for the Odoo demonstration in addition to the requested core order fields.

## Start the project

Requirements: Docker with Docker Compose.

```bash
cp .env.example .env  # recommended; Compose also has local-demo defaults
docker compose up --build -d
docker compose ps
curl http://localhost:8000/health
```

The API container waits for PostgreSQL and runs `alembic upgrade head` on startup. In other words, a normal Compose startup initializes an empty database automatically. Open Swagger UI at <http://localhost:8000/docs>.

If a host port is already occupied, change `API_PORT` or `ADMINER_PORT` in `.env`. PostgreSQL is intentionally available only inside Docker on `veridata.demo-saas-postgres:5432`, avoiding conflicts with a PostgreSQL instance already running on the host.

All services join the Docker network `veridata.network` with these stable aliases:

- API: `veridata.demo-saas-api`
- PostgreSQL: `veridata.demo-saas-postgres`
- Adminer: `veridata.demo-saas-adminer`

The network is treated as shared external infrastructure. Create it once if it does not already exist:

```bash
docker network inspect veridata.network >/dev/null 2>&1 || docker network create veridata.network
```

To include Adminer:

```bash
docker compose --profile tools up -d adminer
```

Adminer is then at <http://localhost:8080>. Use server `postgres` and the PostgreSQL values from `.env`.

## Database operations

Run migrations explicitly when needed:

```bash
docker compose exec demo-saas-api uv run alembic upgrade head
```

Load the idempotent seed dataset:

```bash
docker compose exec demo-saas-api uv run python -m app.seed
```

It creates two tenants, five customers and ten products per tenant, and three sample orders per tenant. The demonstration keys are:

- Acme Distribution: `demo-acme-api-key`
- Globex Wholesale: `demo-globex-api-key`

These keys are intentionally public demo credentials. Replace them outside a local demonstration. Tenant provisioning returns the raw generated/supplied API key exactly once; only its hash is stored.

To reset all local PostgreSQL data (destructive):

```bash
docker compose down -v
docker compose up --build -d
```

## Example API calls

All protected calls use `X-API-Key`. Tenant provisioning/listing uses `ADMIN_API_KEY`; business endpoints use a tenant key.

Create a tenant:

```bash
curl -X POST http://localhost:8000/tenants \
  -H 'X-API-Key: change-me-admin-key' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example Wholesale","external_odoo_instance_id":"odoo-example"}'
```

Create a customer, safely retrying with the same idempotency key:

```bash
curl -X POST http://localhost:8000/customers \
  -H 'X-API-Key: demo-acme-api-key' \
  -H 'Idempotency-Key: customer-import-1001' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Northwind Buyer","email":"buyer@northwind.example","phone":"+1-555-0101"}'
```

List and filter resources:

```bash
curl 'http://localhost:8000/customers?page=1&page_size=20&search=north&sync_status=pending' \
  -H 'X-API-Key: demo-acme-api-key'

curl 'http://localhost:8000/products?page=1&page_size=10&in_stock=true' \
  -H 'X-API-Key: demo-acme-api-key'

curl 'http://localhost:8000/orders?status=confirmed&customer_id=CUSTOMER_ID' \
  -H 'X-API-Key: demo-acme-api-key'
```

Create an order (prices are snapshotted from the products; the server calculates the total):

```bash
curl -X POST http://localhost:8000/orders \
  -H 'X-API-Key: demo-acme-api-key' \
  -H 'Idempotency-Key: order-1001' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id":"CUSTOMER_ID",
    "items":[{"product_id":"PRODUCT_ID","quantity":2}]
  }'
```

The complete runnable request set is in [`requests/demo.http`](requests/demo.http).

## How Commerce Nexus invokes Prismatic

Every business create/update writes its record and an `IntegrationEvent` in the same database transaction. When the Prismatic webhook is configured, a background dispatcher sends `customer.created` and `customer.updated` events to the flow with an HTTP `POST`. Reads do not invoke the flow.

Configure the deployment in `.env` (never commit the real API key):

```dotenv
PRISMATIC_WEBHOOK_URL=https://hooks.prismatic.io/trigger/your-instance-flow-id
PRISMATIC_API_KEY=replace-with-a-rotated-key
```

The request includes the configured `api-key`, the integration event ID as `Idempotency-Key`, and this JSON envelope:

```json
{
  "event_id": "integration-event-uuid",
  "event_type": "customer.created",
  "entity_type": "customer",
  "entity_id": "customer-uuid",
  "tenant_id": "tenant-uuid",
  "occurred_at": "2026-07-22T12:00:00+00:00",
  "payload": {
    "id": "customer-uuid",
    "name": "Ada Buyer",
    "email": "ada@example.com"
  }
}
```

Prismatic exposes the JSON under the trigger result's body data. The dispatcher follows synchronous-result redirects, uses exponential retry delays, and changes the event from `pending` to `dispatched` after Prismatic accepts it. After the flow completes its Odoo work, it calls the Commerce Nexus callback described below; that marks the event `processed` or `failed`.

The event API remains useful for monitoring or manual recovery:

```http
GET /integration-events?page=1&page_size=100
X-API-Key: <tenant key>
```

Typical mappings are:

| Event | Suggested Odoo action |
|---|---|
| `customer.created`, `customer.updated` | Create/update a contact |
| `product.created`, `product.updated` | Create/update a product |
| `order.created` | Create a sales order |
| `order.status_changed` | Update/confirm/cancel a sales order |

Prismatic should use the event `id` as its own idempotency/correlation value, perform the Odoo action, then call the Odoo webhook below. The callback marks the latest dispatched outbound event for that entity as `processed` or `failed` and creates an `odoo.webhook.received` audit event. A failed event can be returned to `pending` with:

```http
POST /integration-events/{event_id}/retry
X-API-Key: <tenant key>
```

The retry endpoint resets delivery-attempt state so the dispatcher can send it again. For a production deployment with multiple API replicas, run the dispatcher as one dedicated worker or add database row claiming so two replicas cannot deliver the same event simultaneously.

## How Prismatic sends Odoo updates back

After an Odoo action or when an Odoo-triggered flow receives a change, Prismatic calls:

```bash
curl -X POST http://localhost:8000/webhooks/odoo \
  -H 'X-API-Key: demo-acme-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "entity_type":"order",
    "event_id":"INTEGRATION_EVENT_ID",
    "entity_id":"INTERNAL_ORDER_ID",
    "external_id":"ODOO-SO-10042",
    "invoice_status":"invoiced",
    "payment_status":"paid",
    "delivery_status":"delivered",
    "synchronization_result":"success",
    "metadata":{"prismatic_execution_id":"execution-id"}
  }'
```

Use either `entity_id` (the SaaS UUID) or `external_id` to identify the record. `synchronization_error` sets `sync_status` to `failed`; the full callback, including errors and metadata, remains in the inbound audit event. Odoo invoice/payment/delivery fields apply to orders, while external IDs and synchronization results apply to customers, products, and orders. The authenticated tenant always scopes the lookup.

## Expose the API to Prismatic

For Cloudflare Tunnel (no account needed for a temporary quick tunnel):

```bash
cloudflared tunnel --url http://localhost:8000
```

For ngrok:

```bash
ngrok http 8000
```

Use the HTTPS URL printed by the tunnel as the base URL in the Prismatic connection, and store the tenant key as a secret used for the `X-API-Key` header. Temporary tunnel URLs change when restarted. Do not expose the default admin or seed keys beyond a controlled demo.

## Tests and local development

Run the suite entirely through Compose:

```bash
docker compose run --rm demo-saas-api uv run pytest
```

The tests use an isolated in-memory SQLite database for speed while the deployed service and migrations target PostgreSQL. They cover authentication, tenant isolation, customer/order creation, event generation, idempotency, filtering/pagination, cross-tenant relationship rejection, and Odoo webhook processing.

If Python 3.12 and uv are installed locally, the equivalent commands are:

```bash
uv sync --frozen
uv run pytest
```

## API behavior notes

- Successful create operations return HTTP `201`; repeated idempotent creates return the original body and status.
- List responses have `items`, `page`, `page_size`, and `total`; page size is capped at 100.
- Errors use `{"error":{"code":"...","message":"...","details":...}}`.
- Logs are JSON and every response contains `X-Request-ID`. A caller-supplied `X-Request-ID` is preserved.
- Tenant reads are derived from the authenticated API key; callers cannot select a different tenant with request data or query parameters.
