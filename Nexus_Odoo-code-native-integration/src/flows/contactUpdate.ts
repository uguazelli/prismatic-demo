import { evaluatesNull } from "@prismatic-io/spectral/dist/conditionalLogic";
/**
 * Your integration will contain one or more flows that each perform different
 * functions. When the flow is invoked, the onTrigger function runs first (if
 * defined), followed by the onExecution function.
 *
 * For information on code-native flows, see
 * https://prismatic.io/docs/integrations/code-native/flows/
 */

// Import core utilities for defining flow logic and handling conditional behavior
import { flow } from "@prismatic-io/spectral";

// Define a single flow within your integration
export const contactUpdate = flow({
  // Core metadata about the flow (name, stable key, description)
  name: "Contact Update",
  stableKey: "contact-update",
  description: "",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  // Define how this flow can be triggered (webhook, schedule, etc.)
  onTrigger: {
    component: "crossFlow", // The component that initiates this flow
    key: "crossFlow", // The specific trigger or action used
    values: {},
  },
  onExecution: async (context, params) => {
    const { configVars } = context;
    const triggerData = (params.onTrigger as any)?.data ?? (params.onTrigger as any)?.results?.body?.data ?? (params.onTrigger as any)?.results?.body ?? (params.onTrigger as any);
    const contact = triggerData || {};
    const externalId = String(contact.external_id || "");

    if (!externalId) {
      // If external_id is missing, delegate to Contact Create
      await context.components.crossFlow.invokeFlow({
        data: contact,
        flowName: "Contact Create",
      });
      return { data: "Delegated to Contact Create" };
    }

    const codeBlock = (await context.components.code.runCode({
      code: `module.exports = async (context, stepResults) => {
  const trigger = stepResults.onTrigger || stepResults.contactUpdateTrigger || stepResults.crossFlowTrigger;
  const contact = trigger?.data || trigger?.results?.body?.data || trigger?.results?.body || {};

  return {
    data: {
      parameters: {
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || ""
      }
    }
  };
};`,
    })) as any;

    await context.components.odoo.updateRecord({
      connection: configVars["Odoo"],
      id: externalId,
      model: "res.partner",
      parameters: codeBlock?.data?.parameters,
    });

    const baseUrl = String(configVars["App Base URL"] || "").replace(/\/$/, "");
    const apiKey = String(configVars["App API Key"] || "demo-acme-api-key");

    const callbackResponse = await context.components.http.httpPost({
      connection: undefined,
      data: JSON.stringify({
        event_id: contact.event_id || contact.id,
        entity_type: "customer",
        entity_id: contact.id || contact.entity_id,
        external_id: externalId,
        synchronization_result: "success",
      }),
      debugRequest: false,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      ignoreSslErrors: false,
      includeFullResponse: false,
      maxRedirects: "5",
      maxRetries: "0",
      queryParams: [],
      responseType: "json",
      retryDelayMS: "0",
      retryOnAllErrors: false,
      timeout: "",
      url: `${baseUrl}/webhooks/odoo`,
      useExponentialBackoff: false,
    });

    return { data: callbackResponse };
  },
});

export default contactUpdate;
