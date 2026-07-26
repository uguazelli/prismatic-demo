import { actions as odooActions } from "@component-manifests/odoo";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import { notifyNexusCallback } from "../nexus/client";
import type { NexusEventPayload } from "../nexus/types";

interface OdooActionResult<T> {
  data: T;
}

export async function syncProductEvent(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { logger } = context;
  const action = String(payload.action || "create").toLowerCase();

  logger.info(`Received Product event [action=${action}]`, {
    action,
    id: payload.id || payload.entity_id,
    name: payload.name,
    sku: payload.sku,
  });

  switch (action) {
    case "create":
      return createProductInOdoo(context, payload);
    case "update":
      return updateProductInOdoo(context, payload);
    case "delete":
      return archiveProductInOdoo(context, payload);
    default:
      logger.warn(`Unhandled product action '${action}'`, { payload });
      return `Ignored action '${action}'`;
  }
}

/** Creates an Odoo product template and saves its record ID in Nexus. */
async function createProductInOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const productId = payload.id || payload.entity_id || "";
  const name = payload.name || "";
  const sku = payload.sku || "";
  const price = Number(payload.price || 0);
  const externalId = productId ? `external_product.product_${productId}` : "";

  logger.info("Creating Odoo product", { productId, name, sku, price });

  const createResult = await odooActions.createRecord.perform<
    OdooActionResult<number>
  >({
    connection: configVars.Odoo,
    externalId,
    model: "product.template",
    parameters: JSON.stringify({
      name,
      default_code: sku,
      list_price: price,
    }),
  });
  const odooId = String(createResult.data);

  logger.info("Odoo product created successfully", { odooId, productId });

  const callbackResult = await notifyNexusCallback(
    context,
    payload,
    "product",
    odooId,
  );
  return { action: "create", odooId, callbackResult };
}

/** Updates an Odoo product template, creating it when no Odoo ID exists. */
async function updateProductInOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");
  const name = payload.name || "";
  const sku = payload.sku || "";
  const price = Number(payload.price || 0);

  logger.info("Updating Odoo product", { externalId, name, sku, price });

  if (!externalId) {
    logger.info("No external_id found; creating the Odoo product instead");
    return createProductInOdoo(context, payload);
  }

  await odooActions.updateRecord.perform<OdooActionResult<boolean>>({
    connection: configVars.Odoo,
    id: externalId,
    model: "product.template",
    parameters: JSON.stringify({
      name,
      default_code: sku,
      list_price: price,
    }),
  });

  logger.info("Odoo product updated successfully", { externalId });

  const callbackResult = await notifyNexusCallback(
    context,
    payload,
    "product",
    externalId,
  );
  return { action: "update", externalId, callbackResult };
}

/** Archives an Odoo product template when Nexus deletes the product. */
async function archiveProductInOdoo(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");

  logger.info("Archiving Odoo product", {
    externalId,
    id: payload.id || payload.entity_id,
  });

  if (externalId) {
    await odooActions.updateRecord.perform<OdooActionResult<boolean>>({
      connection: configVars.Odoo,
      id: externalId,
      model: "product.template",
      parameters: JSON.stringify({ active: false }),
    });
    logger.info("Odoo product archived successfully", { externalId });
  } else {
    logger.info("Skipped Odoo archive because external_id is empty");
  }

  const callbackResult = await notifyNexusCallback(context, payload, "product");
  return { action: "delete", externalId, callbackResult };
}
