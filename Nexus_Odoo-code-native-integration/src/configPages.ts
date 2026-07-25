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
import { configPage, configVar } from "@prismatic-io/spectral";

export const configPages = {
  Configuration: configPage({
    tagline: "Configure your Odoo ERP connection and Nexus settings",
    elements: {
      Odoo: "Odoo",
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
        defaultValue: "demo-acme-api-key",
      }),
    },
  }),
};
