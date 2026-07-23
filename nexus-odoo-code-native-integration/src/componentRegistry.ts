/**
 * Your code-native integration can invoke existing connectors.
 * This is where you declare which connectors your code-native
 * integration uses.
 *
 * For more information, see
 * https://prismatic.io/docs/integrations/code-native/existing-components/
 */

// Import helper for defining which components are available to this integration
import { componentManifests } from "@prismatic-io/spectral";

// Import individual component manifests
// Each provides a bundle of actions/triggers usable within your flows
import odoo from "@component-manifests/odoo";
import http from "@component-manifests/http";
import code from "@component-manifests/code";

// Register all imported components so they can be used by your integration's flows
export const componentRegistry = componentManifests({
  odoo,
  http,
  code,
});
