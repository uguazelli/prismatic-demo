/**
 * Customer-facing configuration wizard for Odoo.
 *
 * The connection is the only instance-level setting. Individual executions
 * choose an Odoo model through their webhook payload.
 */

import { configPage, connectionConfigVar } from "@prismatic-io/spectral";
import { odooOdooApiKey } from "./manifests/odoo/connections/odooApiKey";

export const configPages = {
  Connections: configPage({
    tagline: "Connect the Odoo database used by this integration",
    elements: {
      "Odoo Connection": odooOdooApiKey("65992f5a-ea03-40d1-865b-b10ec0e12870", {
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
      "Nexus Connection": connectionConfigVar({
        stableKey: "0d8322f6-3504-4b52-8d69-9efeb6b39e13",
        dataType: "connection",
        description: "Commerce Nexus callback endpoint and tenant API key",
        inputs: {
          callbackUrl: {
            label: "Odoo Callback URL",
            type: "string",
            required: true,
            shown: true,
            placeholder: "https://nexus.example.com/webhooks/odoo",
            comments: "Full Commerce Nexus URL that receives Odoo synchronization results.",
            permissionAndVisibilityType: "customer",
          },
          apiKey: {
            label: "Nexus API Key",
            type: "password",
            required: true,
            shown: true,
            writeOnly: true,
            comments: "Tenant API key sent to Commerce Nexus in the X-API-Key header.",
            permissionAndVisibilityType: "customer",
          },
        },
      }),
    },
  }),
};
