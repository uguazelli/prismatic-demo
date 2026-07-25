# Prismatic Code-Native & Embedded Developer Cookbook 📖

Welcome to the developer cookbook for **Commerce Nexus + Prismatic Integration**. This guide contains step-by-step recipes for configuring, building, publishing, generating components, and embedding Prismatic Code-Native integrations.

---

## 📑 Table of Contents

1. [Credentials Cheat Sheet](#1-credentials-cheat-sheet)
2. [Recipe 1: Obtaining Prismatic Credentials](#recipe-1-obtaining-prismatic-credentials)
3. [Recipe 2: Pure TypeScript Code-Native Integration Structure](#recipe-2-pure-typescript-code-native-integration-structure)
4. [Recipe 3: CLI Code Generators & Component Tooling](#recipe-3-cli-code-generators--component-tooling)
5. [Recipe 4: CLI Development Workflow (Build, Import & Publish)](#recipe-4-cli-development-workflow-build-import--publish)
6. [Recipe 5: Connecting Commerce Nexus Embedded SDK](#recipe-5-connecting-commerce-nexus-embedded-sdk)
7. [Recipe 6: Architecture Rule – Preventing Double-Creation Loops](#recipe-6-architecture-rule--preventing-double-creation-loops)
8. [Recipe 7: Fetching Live Execution Logs via CLI](#recipe-7-fetching-live-execution-logs-via-cli)

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

## Recipe 2: Pure TypeScript Code-Native Integration Structure

All integration code resides in `Nexus_Odoo-code-native-integration/`:

```
Nexus_Odoo-code-native-integration/
├── src/
│   ├── index.ts              # Integration Metadata (Name, Category, Icon, Flows)
│   ├── configPages.ts        # Customer Configuration Wizard pages & inputs
│   ├── scopedConfigVars.ts   # Reusable connections (Odoo ERP Connection)
│   ├── componentRegistry.ts  # Registered connector manifests (Odoo component)
│   ├── flows/
│   │   ├── index.ts          # Exposes single clean entry flow [contact]
│   │   └── contact.ts        # Single entry flow triggered by Nexus webhook
│   └── services/
│       └── odooSync.ts       # Native TS Service: handleCreate, handleUpdate, handleDelete
├── assets/
│   └── icon.png              # Integration icon logo (Veridata VD monogram)
├── .spectral/
│   └── prism.json            # Auto-generated integration ID tracker
└── package.json              # NPM scripts for building, importing, and publishing
```

### Flow & Service Separation (Idiomatic TypeScript)
Instead of low-code wrappers (`crossFlow`, `code.runCode`), we use a **Single Entry Flow** (`contact.ts`) that delegates directly to native TypeScript service functions (`odooSync.ts`):

```typescript
// src/flows/contact.ts
export const contact = flow({
  name: "Contact",
  stableKey: "contact",
  description: "Sync Customers between Nexus and Odoo",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onExecution: async (context, params) => {
    const rawBody = (params.onTrigger as any)?.results?.body ?? (params.onTrigger as any)?.body;
    const payload = rawBody?.data ?? rawBody ?? {};
    const action = String(payload.action || "create").toLowerCase();

    if (action === "create") return await handleCreateContact(context, payload);
    if (action === "update") return await handleUpdateContact(context, payload);
    if (action === "delete") return await handleDeleteContact(context, payload);
  },
});
```

---

## Recipe 3: CLI Code Generators & Component Tooling

Prismatic provides official CLI commands to scaffold components, generate TypeScript types, and convert low-code templates.

### 🛠️ Tool 1: Download Types for Existing Connectors (`@component-manifests/*`)
When you add a connector (like Odoo, Slack, Salesforce, Shopify) to `src/componentRegistry.ts`, run this command to generate full TypeScript types and autocompletion:

```bash
prism components:manifests generate
```
*or via `npx`:*
```bash
npx @prismatic-io/prism components:manifests generate
```

### 🛠️ Tool 2: Scaffold a Brand New Custom Connector from Scratch
If you want to build your own reusable component (e.g. `nexus-custom-erp`):

```bash
# Interactive scaffolding wizard (Connections, Actions, Triggers, Tests)
npx @prismatic-io/spectral init
```
*or:*
```bash
prism components:init my-custom-connector
```

To publish your custom connector to your Prismatic organization catalog:
```bash
prism components:publish
```

### 🛠️ Tool 3: Convert Low-Code Integrations to Code-Native TypeScript
If you have an existing low-code visual integration in Prismatic and want to convert it into a local TypeScript project:

```bash
prism integrations:convert --integration-id <INTEGRATION_ID>
```

---

## Recipe 4: CLI Development Workflow (Build, Import & Publish)

You can manage 100% of your integration lifecycle from the terminal using standard `prism` CLI commands!

### Step 4.1: Import Draft Definition (`prism integrations:import`)
Compiles your TypeScript bundle and uploads the draft definition to Prismatic:

```bash
cd Nexus_Odoo-code-native-integration
npm run build && prism integrations:import
```

### Step 4.2: Publish Integration Version (`prism integrations:publish`)
Publishes a new integration version live so embedded users and customer instances can consume it:

```bash
prism integrations:publish $(jq -r .integrationId .spectral/prism.json)
```

---

### Step 4.3 (Optional): Deploy Version to Active Customer Instance
If an active customer instance is pinned to an older version, update and deploy it to the newly published version:

```bash
prism instances:update <INSTANCE_ID> --version <VERSION_ID> --deploy
```

---

### 💡 NPM Package Scripts (`package.json`)

Inside `package.json`, these commands are mapped to simple NPM scripts for convenience:

```json
{
  "scripts": {
    "build": "webpack",
    "import": "npm run build && prism integrations:import",
    "publish": "npm run import && prism integrations:publish $(jq -r .integrationId .spectral/prism.json)"
  }
}
```

Running `npm run publish` executes build, import, and publish sequentially!

---

## Recipe 5: Connecting Commerce Nexus Embedded SDK

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

## Recipe 6: Architecture Rule – Preventing Double-Creation Loops

### ⚠️ The Problem: HTTP PUT Recursive Event Loops
If Prismatic calls `PUT /customers/{id}` on Nexus after creating a partner in Odoo:
- `PUT /customers` updates `external_id`, **but emits a `customer.updated` event**.
- Nexus dispatches `customer.updated` back to Prismatic.
- Prismatic receives `customer.updated` and invokes `Contact Update` $\rightarrow$ resulting in a **duplicate contact created in Odoo**.

### ✅ The Solution: Callback Endpoint (`POST /webhooks/odoo`)
In `src/services/odooSync.ts`, Prismatic calls **`POST /webhooks/odoo`** using native `axios`:

```typescript
const callbackBody = {
  event_id: payload.event_id || payload.id,
  entity_type: "customer",
  entity_id: payload.id,
  external_id: odooId,
  synchronization_result: "success",
};

await axios.post(`${baseUrl}/webhooks/odoo`, callbackBody, {
  headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
});
```

**Why this works**: `POST /webhooks/odoo` updates customer `external_id`, sets `sync_status = "success"`, and marks the integration event as `processed` **without emitting an outbound event**, cleanly breaking the loop!

---

## Recipe 7: Fetching Live Execution Logs via CLI

You can query live execution logs directly from your terminal using the `prism` CLI without needing to open the Prismatic web platform.

### 7.1 Fetch Recent Execution Logs (JSON Format)
To get the last 5 execution logs across all active instances:

```bash
prism graphql:query 'query { executionResults(first: 5) { nodes { id startedAt status flow { name } logs { nodes { timestamp severity message } } } } }'
```

### 7.2 Format Execution Logs as a Terminal Table
For a clean table view:

```bash
prism graphql:query 'query { executionResults(first: 5) { nodes { startedAt status flow { name } } } }' \
  --output table \
  --data-path executionResults.nodes \
  --columns startedAt,status,flow.name
```

### 7.3 Filter Execution Logs by Customer Instance ID
To inspect logs for a specific customer instance:

```bash
prism graphql:query 'query($instanceId: ID!) { executionResults(instanceId: $instanceId, first: 5) { nodes { startedAt status logs { nodes { timestamp severity message } } } } }' \
  --variables '{"instanceId":"SW5zdGFuY2U6..."}'
```

### 7.4 Fetch Output of a Specific Step Result
```bash
prism executions:step-result:get --execution <EXECUTION_ID> --step <STEP_NAME>
```

---

## 🍳 Quick Command Summary

```bash
# 1. Download TypeScript types for existing connectors
prism components:manifests generate

# 2. Scaffold a brand new custom connector from scratch
npx @prismatic-io/spectral init

# 3. Build & Import Draft to Prismatic
npm run build && prism integrations:import

# 4. Publish New Integration Version Live
prism integrations:publish $(jq -r .integrationId .spectral/prism.json)

# 5. Fetch Recent Execution Logs via Terminal
prism graphql:query 'query { executionResults(first: 5) { nodes { startedAt status flow { name } logs { nodes { timestamp severity message } } } } }'
```
