# Prismatic Code-Native & Embedded Developer Cookbook 📖

Welcome to the developer cookbook for **Commerce Nexus + Prismatic Integration**. This guide contains step-by-step recipes for configuring, building, publishing, and embedding Prismatic Code-Native integrations.

---

## 📑 Table of Contents

1. [Credentials Cheat Sheet](#1-credentials-cheat-sheet)
2. [Recipe 1: Obtaining Prismatic Credentials](#recipe-1-obtaining-prismatic-credentials)
3. [Recipe 2: Code-Native Integration Structure](#recipe-2-code-native-integration-structure)
4. [Recipe 3: CLI Development Workflow (Build, Import & Publish)](#recipe-3-cli-development-workflow-build-import--publish)
5. [Recipe 4: Connecting Commerce Nexus Embedded SDK](#recipe-4-connecting-commerce-nexus-embedded-sdk)
6. [Recipe 5: Architecture Rule – Preventing Double-Creation Loops](#recipe-5-architecture-rule--preventing-double-creation-loops)

---

## 1. Credentials Cheat Sheet

Commerce Nexus uses **4 key credentials** to talk to Prismatic:

| Credential Name | Where Configured | Required? | Description & Purpose |
| :--- | :--- | :---: | :--- |
| `PRISMATIC_ORGANIZATION_ID` | Nexus `.env` | **YES** | Unique identifier for your Prismatic organization. |
| `PRISMATIC_EMBEDDED_SIGNING_KEY` | Nexus `.secrets/` | **YES** | RSA Private Key (`.pem`) used by Nexus backend to sign user JWT tokens. |
| `PRISMATIC_WEBHOOK_URL` | Nexus DB / `.env` | **YES** | Outbound webhook endpoint in Prismatic receiving Nexus events (`create`, `update`, `delete`). |
| `PRISMATIC_API_KEY` | Nexus DB / `.env` | **Optional** | API key header for Prismatic triggers. *(Optional when `endpointSecurityType: "customer_optional"`)* |

---

## Recipe 1: Obtaining Prismatic Credentials

### Step 1.1: Get `PRISMATIC_ORGANIZATION_ID`
1. Open [Prismatic](https://app.prismatic.io).
2. Click **Organization Settings** (bottom-left gear icon).
3. Under **Organization Info**, copy **Organization ID** (starts with `T3Jn...`).

### Step 1.2: Generate `PRISMATIC_EMBEDDED_SIGNING_KEY`
1. Go to **Organization Settings** $\rightarrow$ **Embedded** tab.
2. Under **Signing Keys**, click **+ Add Signing Key**.
3. Name your key (e.g. `Nexus Dev Key`) and click **Create**.
4. Download / copy the generated RSA Private Key (`.pem`).
5. Save the private key inside Commerce Nexus at:
   ```path
   commerce-nexus/.secrets/prismatic-embedded-private-key.pem
   ```

### Step 1.3: Get `PRISMATIC_WEBHOOK_URL`
- **For Local Testing / Dev**:
  1. Open Prismatic $\rightarrow$ **Integrations** $\rightarrow$ **Nexus Odoo Code Native**.
  2. Click **View in designer** $\rightarrow$ select **Contact** flow.
  3. Click **Test Configuration** or **Test Endpoint** at the top.
  4. Copy the **Test Endpoint URL** (`https://hooks.prismatic.io/trigger/...`).
- **For Customer Deployed Instances**:
  1. When a tenant deploys through embedded UI, copy their unique webhook URL from **Instances** $\rightarrow$ **[Customer Instance]** $\rightarrow$ **Details**.

### Step 1.4: API Keys & Personal Tokens
- **Webhooks**: Your code-native flow has `endpointSecurityType: "customer_optional"`. Prismatic webhooks do **not** require an API key to receive events from Nexus.
- **Personal CLI Tokens**: If needed for `prism` CLI or GraphQL API, click your top-right **`UG` avatar** $\rightarrow$ **Profile** $\rightarrow$ **Access Tokens**.

---

## Recipe 2: Code-Native Integration Structure

All code-native code resides in `Nexus_Odoo-code-native-integration/`:

```
Nexus_Odoo-code-native-integration/
├── src/
│   ├── index.ts              # Integration Metadata (Name, Category, Icon, Flows)
│   ├── configPages.ts        # Customer Configuration Wizard pages & inputs
│   ├── scopedConfigVars.ts   # Reusable connections (Odoo ERP Connection)
│   ├── componentRegistry.ts  # Registered Spectral components (odoo, http, crossFlow)
│   └── flows/
│       ├── index.ts          # Flows exporter
│       ├── contact.ts        # Main router flow (evaluates action: create|update|delete)
│       ├── contactCreate.ts  # Creates partner in Odoo & posts back to /webhooks/odoo
│       ├── contactUpdate.ts  # Updates partner in Odoo & posts back to /webhooks/odoo
│       └── contactDelete.ts  # Deletes partner in Odoo & posts back to /webhooks/odoo
├── assets/
│   └── icon.png              # Integration icon logo (Veridata VD monogram)
├── .spectral/
│   └── prism.json            # Auto-generated integration ID tracker
└── package.json              # NPM scripts for building, importing, and publishing
```

### Making Fields Visible in Embedded Wizard
In `src/configPages.ts`, set `permissionAndVisibilityType: "customer"` so the inputs are visible to users in the embedded popover:

```typescript
export const configPages = {
  Configuration: configPage({
    tagline: "Configure your Odoo ERP connection and Nexus settings",
    elements: {
      Odoo: "Odoo", // References scopedConfigVars.Odoo
      "App Base URL": configVar({
        stableKey: "appBaseUrl",
        dataType: "string",
        permissionAndVisibilityType: "customer",
        defaultValue: "http://localhost:8000",
      }),
    },
  }),
};
```

---

## Recipe 3: CLI Development Workflow (Build, Import & Publish)

You can manage 100% of your integration lifecycle from the terminal without opening the web editor!

### The All-In-One Command (Recommended)

To build, upload draft, AND publish live in one step:

```bash
cd Nexus_Odoo-code-native-integration
npm run publish
```

### What `npm run publish` Does Under the Hood:

1. **Builds Bundle**: `npm run build` (Webpack compiles TypeScript to `dist/index.js`).
2. **Uploads Draft**: `prism integrations:import` (Uploads code-native package).
3. **Publishes Version**: `prism integrations:publish $(jq -r .integrationId .spectral/prism.json)` (Publishes draft so the embedded popover serves the new version).

---

## Recipe 4: Connecting Commerce Nexus Embedded SDK

### Backend: Generate RSA Signed JWT (`POST /integrations/prismatic/embedded-token`)
Commerce Nexus signs a short-lived JWT token containing tenant context:

```python
claims = {
    "sub": f"nexus-admin-{tenant.id}",
    "external_id": f"nexus-admin-{tenant.id}",
    "name": f"{tenant.name} Admin",
    "organization": PRISMATIC_ORGANIZATION_ID,
    "customer": tenant.id,
    "customer_name": tenant.name,
    "role": "admin",
    "iat": datetime.now(timezone.utc) - timedelta(seconds=30),
    "exp": datetime.now(timezone.utc) + timedelta(hours=1)
}
token = jwt.encode(claims, private_rsa_pem, algorithm="RS256")
```

### Frontend: Launch Embedded Popover (`app.js`)
When user clicks **Connect Odoo** in Nexus UI:

```javascript
// 1. Initialize Prismatic Embedded SDK
window.prismatic.init({
  prismaticUrl: "https://app.prismatic.io",
  screenConfiguration: {
    instance: { hideBackToMarketplace: true },
    configurationWizard: { mode: "streamlined", connectionConfiguration: "inline" },
  },
});

// 2. Authenticate session using JWT from backend
await window.prismatic.authenticate({ token: jwtToken });

// 3. Open popover modal to configure & deploy instance
window.prismatic.configureInstance({
  integrationName: "Nexus Odoo Code Native",
  usePopover: true,
});
```

---

## Recipe 5: Architecture Rule – Preventing Double-Creation Loops

### ⚠️ The Problem: HTTP PUT Recursive Event Loops
If Prismatic calls `PUT /customers/{id}` on Nexus after creating a partner in Odoo:
- `PUT /customers` updates `external_id`, **but emits a `customer.updated` event**.
- Nexus dispatches `customer.updated` back to Prismatic.
- Prismatic receives `customer.updated` and invokes `Contact Update` $\rightarrow$ resulting in a **duplicate contact created in Odoo**.

### ✅ The Solution: Callback Endpoint (`POST /webhooks/odoo`)
In `contactCreate.ts`, `contactUpdate.ts`, and `contactDelete.ts`, Prismatic calls **`POST /webhooks/odoo`**:

```typescript
const callbackResponse = await context.components.http.httpPost({
  connection: undefined,
  url: `${baseUrl}/webhooks/odoo`,
  headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
  data: JSON.stringify({
    event_id: contact.event_id || contact.id,
    entity_type: "customer",
    entity_id: contact.id,
    external_id: odooId,
    synchronization_result: "success",
  }),
});
```

**Why this works**: `POST /webhooks/odoo` updates customer `external_id`, sets `sync_status = "success"`, and marks the integration event as `processed` **without emitting an outbound event**, cleanly breaking the loop!

---

## 🍳 Quick Command Summary

```bash
# 1. Install Dependencies
npm install

# 2. Build TypeScript Bundle
npm run build

# 3. Import Draft to Prismatic
npm run import

# 4. Build, Import, and Publish Live in One Step
npm run publish
```
