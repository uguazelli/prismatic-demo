/**
 * Customer-facing configuration wizard for Odoo.
 *
 * The connection is the only instance-level setting. Individual executions
 * choose an Odoo model through their webhook payload.
 */

import { configPage } from "@prismatic-io/spectral";
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
    },
  }),
};
