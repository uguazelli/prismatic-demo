# nexus-odoo

Connect a customer Odoo database to Prismatic using Odoo's API Key / JSON-2 connection.

## Configuration

1. Enter the Odoo base URL, such as `https://your-company.odoo.com`.
2. Enter a port only when the Odoo server uses a non-standard port, such as `8069`.
3. Enter the exact Odoo database name.
4. Create an API key for the Odoo user that should run the integration, then enter it in the
   masked **API Key** field. Do not use the database master password.
5. Configure **Nexus Connection** with the full Commerce Nexus callback URL, ending in
   `/webhooks/odoo`, and the tenant API key that Nexus expects in `X-API-Key`.

The callback URL must be reachable from the Prismatic execution environment. A URL such as
`http://localhost:8000/webhooks/odoo` only works when Nexus is reachable from that same runtime;
for Prismatic Cloud, expose Nexus through HTTPS or an appropriate private connectivity option.

## Request

Invoke **List Odoo Records** with a JSON body containing the model to read:

```json
{
  "model": "res.partner"
}
```

The `model` field is optional and defaults to `res.partner`. The flow fetches up to 100 records.
Other examples include `product.product`, `sale.order`, and any custom model the Odoo user can read.

## Customer synchronization

Invoke **Sync Nexus Customer to Odoo** with a `customer.created` or `customer.updated` event:

```json
{
  "event_id": "evt_integration_event_uuid_1001",
  "event_type": "customer.created",
  "entity_type": "customer",
  "entity_id": "18f17023-3d65-45da-a876-3ff6ca8b74e5",
  "tenant_id": "tenant_uuid_acme",
  "occurred_at": "2026-07-23T19:49:31+00:00",
  "payload": {
    "id": "18f17023-3d65-45da-a876-3ff6ca8b74e5",
    "name": "Northwind Buyer Inc",
    "email": "buyer@northwind.example",
    "phone": "+1-555-0101"
  }
}
```

The flow creates or updates `res.partner`. It stores a deterministic Odoo external ID such as
`nexus.customer_18f17023_3d65_45da_a876_3ff6ca8b74e5`, making repeated deliveries idempotent.
After the Odoo operation it calls the configured Nexus `/webhooks/odoo` endpoint with the source
`event_id`, Nexus customer ID, Odoo numeric record ID, synchronization result, and Prismatic
execution ID.

The Prismatic endpoint uses customer-required security. Commerce Nexus must send the instance's
Prismatic API key in the `api-key` header.

## Permissions

The Odoo user associated with the API key must have read access to the requested model. For this
demo, the request may name any model. Use a dedicated integration user with only the permissions
required for the intended records before exposing the endpoint outside a controlled environment.
