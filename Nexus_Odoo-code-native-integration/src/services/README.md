# Service layout

The service folders follow the direction in which data moves:

```text
services/
├── nexus-events/       # Nexus webhook events -> Odoo
│   ├── index.ts        # Routes events by entity type
│   ├── customer.ts     # Creates, updates, and deletes Odoo partners
│   └── product.ts      # Creates, updates, and archives Odoo products
├── odoo-to-nexus/      # Scheduled Odoo changes -> Nexus
│   ├── index.ts        # Runs the delta sync and manages the cursor
│   └── partners.ts     # Reads Odoo partners and builds Nexus payloads
└── nexus/              # Shared Nexus HTTP boundary
    ├── client.ts       # Calls the loop-safe Nexus callback
    └── types.ts        # Nexus event and callback payload types
```

Start from `src/flows`. Each flow imports the `index.ts` from the service folder
with the same name. Entity-specific Odoo operations stay beside their event
router, while shared Nexus HTTP code stays in `nexus/`.
