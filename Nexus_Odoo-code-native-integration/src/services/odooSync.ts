import axios from "axios";
type ActionPerformContext = any;

export interface CustomerPayload {
  action?: string;
  event_id?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  external_id?: string | null;
  [key: string]: any;
}

/**
 * Sends a webhook completion status back to Commerce Nexus (/webhooks/odoo)
 * so Nexus can update external_id and sync_status without emitting outbound loops.
 */
async function notifyNexusCallback(
  context: ActionPerformContext,
  payload: CustomerPayload,
  odooId?: string
) {
  const { configVars, logger } = context;
  const baseUrl = String(configVars["App Base URL"] || "").replace(/\/$/, "");
  const apiKey = String(configVars["App API Key"] || "demo-acme-api-key");
  const entityId = payload.id || payload.entity_id || "";

  const callbackBody = {
    event_id: payload.event_id || entityId,
    entity_type: "customer",
    entity_id: entityId,
    external_id: odooId || payload.external_id || undefined,
    synchronization_result: "success",
  };

  logger.info("Posting completion status to Nexus /webhooks/odoo", {
    url: `${baseUrl}/webhooks/odoo`,
    callbackBody,
  });

  try {
    const response = await axios.post(`${baseUrl}/webhooks/odoo`, callbackBody, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      timeout: 10000,
    });
    logger.info("Nexus callback succeeded", { status: response.status, data: response.data });
    return response.data;
  } catch (error: any) {
    logger.error("Nexus callback failed", { error: error.message, response: error.response?.data });
    throw error;
  }
}

/**
 * Handle CREATE Contact: Creates partner in Odoo and updates Nexus with external_id
 */
export async function handleCreateContact(
  context: ActionPerformContext,
  payload: CustomerPayload
) {
  const { configVars, logger, components } = context;

  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const customerId = payload.id || payload.entity_id || "";
  const externalId = customerId ? `external_contact.contact_${customerId}` : "";

  logger.info("Starting handleCreateContact", { name, email, phone, customerId });

  if (!name) {
    logger.warn("Warning: Customer name is empty in payload", { payload });
  }

  // 1. Create Record in Odoo via Odoo Component Manifest
  const createResult = (await (components as any).odoo.createRecord({
    connection: configVars["Odoo"],
    externalId: externalId,
    model: "res.partner",
    parameters: JSON.stringify({
      name: name,
      email: email,
      phone: phone,
    }),
  })) as any;

  const odooId = String(
    createResult?.data?.id || createResult?.data || createResult?.id || ""
  );

  logger.info("Odoo partner created successfully", { odooId, customerId });

  // 2. Notify Nexus Callback
  const callbackResult = await notifyNexusCallback(context, payload, odooId);
  return { action: "create", odooId, callbackResult };
}

/**
 * Handle UPDATE Contact: Updates existing partner in Odoo by external_id
 */
export async function handleUpdateContact(
  context: ActionPerformContext,
  payload: CustomerPayload
) {
  const { configVars, logger, components } = context;

  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const externalId = String(payload.external_id || "");

  logger.info("Starting handleUpdateContact", { name, email, phone, externalId });

  if (!externalId) {
    logger.info("No external_id found on update event. Delegating to handleCreateContact.");
    return await handleCreateContact(context, payload);
  }

  // 1. Update Record in Odoo
  await (components as any).odoo.updateRecord({
    connection: configVars["Odoo"],
    id: externalId,
    model: "res.partner",
    parameters: JSON.stringify({
      name: name,
      email: email,
      phone: phone,
    }),
  });

  logger.info("Odoo partner updated successfully", { externalId });

  // 2. Notify Nexus Callback
  const callbackResult = await notifyNexusCallback(context, payload, externalId);
  return { action: "update", externalId, callbackResult };
}

/**
 * Handle DELETE Contact: Deletes partner in Odoo by external_id
 */
export async function handleDeleteContact(
  context: ActionPerformContext,
  payload: CustomerPayload
) {
  const { configVars, logger, components } = context;
  const externalId = String(payload.external_id || "");

  logger.info("Starting handleDeleteContact", { externalId, id: payload.id });

  if (externalId) {
    try {
      await (components as any).odoo.deleteRecordById({
        connection: configVars["Odoo"],
        id: externalId,
        model: "res.partner",
      });
      logger.info("Odoo partner deleted successfully", { externalId });
    } catch (err: any) {
      logger.warn("Failed to delete Odoo partner (may already be deleted)", {
        error: err.message,
      });
    }
  } else {
    logger.info("Skipped Odoo deletion: customer was never synced to Odoo (external_id is null).");
  }

  // Notify Nexus Callback
  const callbackResult = await notifyNexusCallback(context, payload);
  return { action: "delete", externalId, callbackResult };
}
