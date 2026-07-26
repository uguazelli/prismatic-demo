/**
 * This project represents a code-native integration. A customer
 * user will walk through a config wizard (defined in configPages.ts),
 * and flows for that customer (defined in flows.ts) will run.
 *
 * You can update your integration's name or description by editing the
 * properties below.
 *
 * To learn more about code-native integrations, see
 * https://prismatic.io/docs/integrations/code-native/
 */

// Import core helper for defining integrations
import { integration } from "@prismatic-io/spectral";

// Import your integration's core building blocks
import flows from "./flows";
import { configPages } from "./configPages";
import { componentRegistry } from "./componentRegistry";
import documentation from "../documentation.md";

// Re-export shared modules so other files (or tests) can import from index
export { configPages } from "./configPages";
export { componentRegistry } from "./componentRegistry";

// Define the integration itself
const nexusOdooIntegration = integration({
  name: "Nexus Odoo Code Native",
  category: "ERP",
  description:
    "Demo code-native integration connecting Veridata Commerce Nexus with Odoo ERP. Features real-time customer and product synchronization plus scheduled contact updates from Odoo.",
  iconPath: "icon.png",
  componentRegistry,
  flows,
  configPages,
  documentation,
});
export default nexusOdooIntegration;
