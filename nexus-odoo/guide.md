# Prismatic Code-Native Integration Checklist

## 1. Install prerequisites

Install:

* Node.js
* npm
* Visual Studio Code
* Prismatic CLI

```bash
npm install -g @prismatic-io/prism
```

## 2. Authenticate the Prismatic CLI

```bash
prism login
```

This authenticates the developer against the Prismatic organization.

## 3. Initialize the integration project

```bash
prism integrations:init my-integration
```

## 4. Enter the project directory

```bash
cd my-integration
```

## 5. Install dependencies

```bash
npm install
```

## 6. Choose how to connect to external systems

Use one of these approaches:

* Install and reference an existing Prismatic component.
* Write the API client directly inside the integration.
* Create a separate reusable custom component.

For an existing component manifest:

```bash
npx cni-component-manifest component-key
```

Then register the component in `componentRegistry.ts`.

For a separate custom component:

```bash
prism components:init my-component
```

## 7. Define connections

Define or reference the authentication required by each external system, such as:

* OAuth
* API key
* Username and password
* Client credentials
* Base URL and token

Connections describe how customer credentials are collected and supplied to the integration.

## 8. Define configuration pages

Create the configuration experience in `configPages.ts`.

Configuration pages can collect:

* Connections
* URLs
* IDs
* Mapping options
* Dropdown selections
* Feature settings
* Schedule preferences

The page defines the fields. Each customer instance supplies its own values.

## 9. Create reusable clients and helper functions

Create shared code for:

* HTTP requests
* Authentication headers
* Pagination
* Error handling
* Data transformation
* Logging

Example structure:

```text
src/
├── client.ts
├── helpers.ts
├── configPages.ts
├── componentRegistry.ts
└── flows/
```

## 10. Create triggers

Define how each flow starts:

* Webhook
* Schedule
* Manual execution
* Polling
* External event
* Another flow

## 11. Create flows

Create one flow for each independent process.

Examples:

```text
flows/
├── createRecord.ts
├── updateRecord.ts
├── syncRecords.ts
└── processWebhook.ts
```

Each flow normally contains:

```text
Trigger
→ Validate input
→ Read configuration
→ Call external systems
→ Transform data
→ Handle errors
→ Return a result
```

## 12. Assemble the integration

Export the following as one integration definition:

* Metadata
* Configuration pages
* Component registry
* Flows
* Required connections

The collection of exported flows and configuration becomes the integration.

## 13. Add environment variables only when appropriate

Use environment variables for developer or organization-controlled values.

Do not use them for customer-specific credentials that should be collected through Prismatic connections or configuration pages.

## 14. Validate and format the project

Run the scripts available in `package.json`, commonly:

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

Available scripts may differ by generated project version.

## 15. Test each flow

Test:

* Successful execution
* Invalid input
* Authentication failure
* API timeout
* Missing configuration
* Pagination
* Duplicate events
* Retry behavior

Use test credentials or build-only connections during development.

## 16. Import the integration into Prismatic

Use the import command provided by the generated project or the current Prism CLI workflow.

The import uploads the integration definition to your Prismatic organization.

## 17. Test the imported integration

Inside Prismatic:

* Open the imported integration.
* Enter test configuration.
* Connect test accounts.
* Create a test instance.
* Run each flow.
* Inspect logs and execution results.

## 18. Publish a version

Once testing is complete:

* Publish the integration version.
* Add release notes.
* Confirm configuration changes.
* Confirm compatibility with existing instances.

## 19. Make the integration available to customers

Expose it through:

* Prismatic’s embedded marketplace
* Your SaaS integration page
* An internal provisioning process
* The Prismatic API

## 20. Authenticate SaaS users

Your SaaS backend should:

* Authenticate its own user.
* Identify the user’s tenant or company.
* Generate a short-lived Prismatic JWT.
* Return the JWT to the frontend.

The frontend uses that JWT to open the Prismatic embedded experience.

## 21. Create or configure an instance

For each customer installation:

* Identify the customer.
* Select the integration.
* Complete the configuration pages.
* Authorize required connections.
* Create or update the instance.
* Deploy or enable it.

An instance is the customer-specific configuration and deployment of the integration.

## 22. Run and monitor the integration

After deployment, monitor:

* Executions
* Errors
* Logs
* Retries
* Webhook activity
* Schedule activity
* Connection expiration
* API rate limits

## 23. Release future changes

For each new version:

```text
Change code
→ Test locally
→ Import
→ Test in Prismatic
→ Publish version
→ Upgrade selected instances
→ Monitor results
```

## Mental model

```text
Component or API client
        ↓
Connections
        ↓
Configuration pages
        ↓
Flows
        ↓
Integration
        ↓
Import and publish
        ↓
Customer configuration
        ↓
Instance
        ↓
Executions and monitoring
```

## Compact checklist

```text
1. Install CLI
2. Log in
3. Initialize project
4. Run npm install
5. Add or build connectors
6. Define connections
7. Define config pages
8. Build shared clients
9. Define triggers
10. Build flows
11. Export the integration
12. Format and validate
13. Test locally
14. Import into Prismatic
15. Create a test instance
16. Test executions
17. Publish a version
18. Embed or expose it in the SaaS
19. Generate SaaS-user JWTs
20. Configure customer instances
21. Deploy and monitor
22. Publish and roll out updates
```
