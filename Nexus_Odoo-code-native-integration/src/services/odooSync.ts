import { actions as odooActions } from "@component-manifests/odoo";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import {
  getErrorDetails,
  notifyNexusCallback,
  type NexusEventPayload,
} from "./nexusClient";

interface OdooActionResult<T> {
  data: T;
}

/** Creates a partner in Odoo and updates Nexus with the Odoo record ID. */
export async function handleCreateContact(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
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

  const callbackResult = await notifyNexusCallback(
    context,
    payload,
    "customer",
    odooId,
  );
  return { action: "create", odooId, callbackResult };
}

/** Updates an existing Odoo partner, creating it when no Odoo ID exists. */
export async function handleUpdateContact(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
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
    "customer",
    externalId,
  );
  return { action: "update", externalId, callbackResult };
}

/** Deletes an Odoo partner when Nexus has an associated Odoo record ID. */
export async function handleDeleteContact(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
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

  const callbackResult = await notifyNexusCallback(
    context,
    payload,
    "customer",
  );
  return { action: "delete", externalId, callbackResult };
}
