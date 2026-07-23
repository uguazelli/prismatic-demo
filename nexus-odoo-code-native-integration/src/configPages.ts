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

// Export a collection of configuration pages
// Each page groups related settings that users fill out during deployment
export const configPages = {
  Configuration: configPage({
    tagline: "Connect this integration to the customer's Odoo environment.",
    // Elements define individual inputs or connections shown on the page
    elements: {
      "Odoo Connection": connectionConfigVar({
        stableKey: "odooConnection",
        dataType: "connection",
        inputs: {
          baseUrl: {
            label: "Odoo Base URL",
            type: "string",
            required: true,
          },
          port: {
            label: "Port",
            type: "string",
            required: false,
          },
          db: {
            label: "Database",
            type: "string",
            required: true,
          },
          apiKey: {
            label: "API Key",
            type: "password",
            required: true,
          },
        },
        description: "Odoo API key connection",
        permissionAndVisibilityType: "customer",
        visibleToOrgDeployer: true,
      }),
    },
  }),
  "Customer Sync Experience": configPage({
    tagline:
      "Choose how customer records move between Veridata Commerce Nexus and Odoo.",
    elements: {
      "Enable Customer Sync": configVar({
        stableKey: "enable-customer-sync",
        dataType: "boolean",
        defaultValue: true,
        description:
          "Turn customer synchronization on or off for this deployed instance.",
      }),
      "Sync Direction": configVar({
        stableKey: "sync-direction",
        dataType: "picklist",
        pickList: ["Nexus to Odoo", "Odoo to Nexus", "Bidirectional"],
        defaultValue: "Nexus to Odoo",
        description:
          "Select which system publishes customer changes to the other system.",
      }),
      "Customer Sync Schedule": configVar({
        stableKey: "customer-sync-schedule",
        dataType: "schedule",
        scheduleType: "hour",
        description:
          "Choose how frequently scheduled customer reconciliation should run.",
      }),
      "Send Failure Notifications To": configVar({
        stableKey: "send-failure-notifications-to",
        dataType: "string",
        defaultValue: "",
        description:
          "Email address that should receive customer synchronization failure alerts.",
      }),
    },
  }),
};
