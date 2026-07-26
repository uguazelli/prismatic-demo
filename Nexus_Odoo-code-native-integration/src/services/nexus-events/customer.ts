import { actions as odooActions } from "@component-manifests/odoo";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import { getErrorDetails, notifyNexusCallback } from "../nexus/client";
import type { NexusEventPayload } from "../nexus/types";

interface OdooActionResult<T> {
  data: T;
}

export async function syncCustomerEvent(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { logger } = context;
  const action = String(payload.action || "create").toLowerCase();

  logger.info(`Received Customer event [action=${action}]`, {
    action,
    id: payload.id || payload.entity_id,
    name: payload.name,
    email: payload.email,
  });

  switch (action) {
    case "create":
      return createCustomerInOdoo(context, payload);
    case "update":
      return updateCustomerInOdoo(context, payload);
    case "delete":
      return deleteCustomerFromOdoo(context, payload);
    default:
      logger.warn(`Unhandled customer action '${action}'`, { payload });
      return `Ignored action '${action}'`;
  }
}

/** Creates an Odoo partner and saves its record ID in Nexus. */
async function createCustomerInOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const customerId = payload.id || payload.entity_id || "";
  const externalId = customerId ? `external_contact.contact_${customerId}` : "";

  logger.info("Creating Odoo partner", { name, email, phone, customerId });

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

/** Updates an Odoo partner, creating it when no Odoo ID exists. */
async function updateCustomerInOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const name = payload.name || "";
  const email = payload.email || "";
  const phone = payload.phone || "";
  const externalId = String(payload.external_id || "");

  logger.info("Updating Odoo partner", { name, email, phone, externalId });

  if (!externalId) {
    logger.info("No external_id found; creating the Odoo partner instead");
    return createCustomerInOdoo(context, payload);
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
async function deleteCustomerFromOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");

  logger.info("Deleting Odoo partner", {
    externalId,
    id: payload.id || payload.entity_id,
  });

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
