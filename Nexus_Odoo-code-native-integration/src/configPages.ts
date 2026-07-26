/**
 * When a customer deploys an instance of your integration,
 * they will walk through a configuration wizard. In this
 * example configuration wizard, we prompt the customer for
 * their authentication information, and then use that
 * information to fetch data for a dropdown menu.
 *
 * For more information on the code-native config wizards, see
 * https://prismatic.io/docs/integrations/code-native/config-wizard/
 */

// Import utilities for defining configuration pages and variables
// Config pages define the UI that deployers use to set up an integration
import {
  configPage,
  configVar,
  connectionConfigVar,
} from "@prismatic-io/spectral";
import { odooOdooApiKey } from "@component-manifests/odoo/dist/connections/odooApiKey";

export const configPages = {
  Configuration: configPage({
    tagline: "Configure your Odoo ERP connection and Nexus settings",
    elements: {
      Odoo: odooOdooApiKey("odoo-instance-connection", {
        baseUrl: {
          value: "",
          permissionAndVisibilityType: "customer",
        },
        port: {
          value: "",
          permissionAndVisibilityType: "customer",
        },
        db: {
          value: "",
          permissionAndVisibilityType: "customer",
        },
        apiKey: {
          value: "",
          permissionAndVisibilityType: "customer",
          writeOnly: true,
        },
      }),
      "Upstash Redis": connectionConfigVar({
        stableKey: "upstash-redis-connection",
        dataType: "connection",
        description:
          "Redis connection used to prevent duplicate Nexus product events",
        permissionAndVisibilityType: "customer",
        inputs: {
          restUrl: {
            label: "REST URL",
            type: "string",
            required: true,
            shown: true,
            permissionAndVisibilityType: "customer",
            comments: "The HTTPS REST URL from the Upstash Redis console",
          },
          restToken: {
            label: "REST Token",
            type: "password",
            required: true,
            shown: true,
            writeOnly: true,
            permissionAndVisibilityType: "customer",
            comments: "The replacement Upstash Redis REST token",
          },
        },
      }),
      "App Base URL": configVar({
        stableKey: "appBaseUrl",
        dataType: "string",
        description: "Base URL of your Commerce Nexus instance",
        permissionAndVisibilityType: "customer",
        defaultValue: "http://localhost:8000",
      }),
      "App API Key": configVar({
        stableKey: "appApiKey",
        dataType: "string",
        description: "API Key for Commerce Nexus",
        permissionAndVisibilityType: "customer",
      }),
      "Odoo Sync Schedule": configVar({
        stableKey: "odooSyncSchedule",
        dataType: "schedule",
        description:
          "Schedule for synchronizing changed Odoo contacts to Commerce Nexus",
        permissionAndVisibilityType: "customer",
        defaultValue: "*/15 * * * *",
      }),
    },
  }),
};
