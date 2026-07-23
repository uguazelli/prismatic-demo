# nexus-odoo

Connect a customer Odoo database to Prismatic using Odoo's API Key / JSON-2 connection.

## Configuration

1. Enter the Odoo base URL, such as `https://your-company.odoo.com`.
2. Enter a port only when the Odoo server uses a non-standard port, such as `8069`.
3. Enter the exact Odoo database name.
4. Create an API key for the Odoo user that should run the integration, then enter it in the
   masked **API Key** field. Do not use the database master password.

## Request

Invoke **List Odoo Records** with a JSON body containing the model to read:

```json
{
  "model": "res.partner"
}
```

The `model` field is optional and defaults to `res.partner`. The flow fetches up to 100 records.
Other examples include `product.product`, `sale.order`, and any custom model the Odoo user can read.

## Permissions

The Odoo user associated with the API key must have read access to the requested model. For this
demo, the request may name any model. Use a dedicated integration user with only the permissions
required for the intended records before exposing the endpoint outside a controlled environment.
