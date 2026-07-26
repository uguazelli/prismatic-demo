import { actions as odooActions } from "@component-manifests/odoo";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import {
  getErrorDetails,
  postNexusWebhook,
  type CustomerPayload,
} from "./nexusClient";

export type { CustomerPayload } from "./nexusClient";

interface OdooActionResult<T> {
  data: T;
}

/**
 * Sends a webhook completion status back to Commerce Nexus (/webhooks/odoo)
 * so Nexus can update external_id and sync_status without emitting outbound loops.
 */
async function notifyNexusCallback(
  context: FlowExecutionContext,
  payload: CustomerPayload,
  odooId?: string,
) {
  const { logger } = context;
  const entityId = payload.id || payload.entity_id || "";

  const callbackBody = {
    event_id: payload.event_id || entityId,
    entity_type: "customer",
    entity_id: entityId,
    external_id: odooId || payload.external_id || undefined,
    synchronization_result: "success",
  };

  logger.info("Posting completion status to Nexus /webhooks/odoo", {
    callbackBody,
  });

  try {
    const response = await postNexusWebhook(context, callbackBody);
    logger.info("Nexus callback succeeded");
    return response;
  } catch (error: unknown) {
    logger.error("Nexus callback failed", getErrorDetails(error));
    throw error;
  }
}

/** Creates a partner in Odoo and updates Nexus with the Odoo record ID. */
export async function handleCreateContact(
  context: FlowExecutionContext,
  payload: CustomerPayload,
) {
  const { configVars, logger } = context;
  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const customerId = payload.id || payload.entity_id || "";
  const externalId = customerId ? `external_contact.contact_${customerId}` : "";

  logger.info("Starting handleCreateContact", {
    name,
    email,
    phone,
    customerId,
  });

  if (!name) {
    logger.warn("Customer name is empty", { payload });
  }

  const createResult = await odooActions.createRecord.perform<
    OdooActionResult<number>
  >({
    connection: configVars.Odoo,
    externalId,
    model: "res.partner",
    parameters: JSON.stringify({ name, email, phone }),
  });
  const odooId = String(createResult.data);

  logger.info("Odoo partner created successfully", { odooId, customerId });

  const callbackResult = await notifyNexusCallback(context, payload, odooId);
  return { action: "create", odooId, callbackResult };
}

/** Updates an existing Odoo partner, creating it when no Odoo ID exists. */
export async function handleUpdateContact(
  context: FlowExecutionContext,
  payload: CustomerPayload,
) {
  const { configVars, logger } = context;
  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const externalId = String(payload.external_id || "");

  logger.info("Starting handleUpdateContact", {
    name,
    email,
    phone,
    externalId,
  });

  if (!externalId) {
    logger.info("No external_id found; creating the Odoo partner instead");
    return handleCreateContact(context, payload);
  }

  await odooActions.updateRecord.perform<OdooActionResult<boolean>>({
    connection: configVars.Odoo,
    id: externalId,
    model: "res.partner",
    parameters: JSON.stringify({ name, email, phone }),
  });

  logger.info("Odoo partner updated successfully", { externalId });

  const callbackResult = await notifyNexusCallback(
    context,
    payload,
    externalId,
  );
  return { action: "update", externalId, callbackResult };
}

/** Deletes an Odoo partner when Nexus has an associated Odoo record ID. */
export async function handleDeleteContact(
  context: FlowExecutionContext,
  payload: CustomerPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");

  logger.info("Starting handleDeleteContact", { externalId, id: payload.id });

  if (externalId) {
    try {
      await odooActions.deleteRecordById.perform<OdooActionResult<boolean>>({
        connection: configVars.Odoo,
        id: externalId,
        model: "res.partner",
      });
      logger.info("Odoo partner deleted successfully", { externalId });
    } catch (error: unknown) {
      logger.warn(
        "Failed to delete Odoo partner; it may already be deleted",
        getErrorDetails(error),
      );
    }
  } else {
    logger.info("Skipped Odoo deletion because external_id is empty");
  }

  const callbackResult = await notifyNexusCallback(context, payload);
  return { action: "delete", externalId, callbackResult };
}
