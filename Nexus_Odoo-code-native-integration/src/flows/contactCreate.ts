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
export const contactCreate = flow({
  name: "Contact Create",
  stableKey: "contact-create",
  description: "",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onTrigger: {
    component: "crossFlow",
    key: "crossFlow",
    values: {},
  },
  onExecution: async (context, params) => {
    const { configVars } = context;
    const triggerData = (params.onTrigger as any)?.data ?? (params.onTrigger as any)?.results?.body?.data ?? (params.onTrigger as any)?.results?.body ?? (params.onTrigger as any);
    const contact = triggerData || {};

    const codeBlock = (await context.components.code.runCode({
      code: `module.exports = async (context, stepResults) => {
  const trigger = stepResults.onTrigger || stepResults.contactCreateTrigger || stepResults.crossFlowTrigger;
  const contact = trigger?.data || trigger?.results?.body?.data || trigger?.results?.body || {};

  return {
    data: {
      parameters: {
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || ""
      },
      externalId: contact.id ? \`external_contact.contact_\${contact.id}\` : ""
    }
  };
};`,
    })) as any;

    const createRecord = (await context.components.odoo.createRecord({
      connection: configVars["Odoo"],
      externalId: codeBlock?.data?.externalId,
      model: "res.partner",
      parameters: codeBlock?.data?.parameters,
    })) as any;

    const odooId = String(createRecord?.data?.id || createRecord?.data || createRecord?.id || "");
    const baseUrl = String(configVars["App Base URL"] || "").replace(/\/$/, "");
    const apiKey = String(configVars["App API Key"] || "demo-acme-api-key");

    const callbackResponse = await context.components.http.httpPost({
      connection: undefined,
      data: JSON.stringify({
        event_id: contact.event_id || contact.id,
        entity_type: "customer",
        entity_id: contact.id || contact.entity_id,
        external_id: odooId,
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

export default contactCreate;
