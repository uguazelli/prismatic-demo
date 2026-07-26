# Nexus Odoo Code-Native Integration

Prismatic code-native integration for synchronizing Commerce Nexus customers
and products with Odoo.

## Flows

- `Nexus Events`: receives Commerce Nexus webhooks, routes customer events to
  Odoo partners, routes product events to Odoo product templates, and ignores
  order events until order synchronization is implemented.
- `Odoo to Nexus Sync`: polls changed Odoo partners on a customer-configurable
  schedule and posts updates to Commerce Nexus.

## Configuration

- `Odoo`: reusable customer-activated Odoo connection.
- `App Base URL`: Commerce Nexus API base URL.
- `App API Key`: Commerce Nexus tenant API key.
- `Odoo Sync Schedule`: polling schedule for Odoo changes.

## Commands

```bash
npm run build
npm run lint
npm run import
npm run publish
```

This project was converted from a low-code integration. The conversion metadata
under `.spectral/` is required by Prismatic and should remain in place.
