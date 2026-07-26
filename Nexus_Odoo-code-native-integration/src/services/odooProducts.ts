import { actions as odooActions } from "@component-manifests/odoo";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import { notifyNexusCallback, type NexusEventPayload } from "./nexusClient";

interface OdooActionResult<T> {
  data: T;
}

/** Creates an Odoo product template and saves its record ID in Nexus. */
export async function handleCreateProduct(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const productId = payload.id || payload.entity_id || "";
  const name = payload.name || "";
  const sku = payload.sku || "";
  const price = Number(payload.price || 0);
  const externalId = productId ? `external_product.product_${productId}` : "";

  logger.info("Starting handleCreateProduct", {
    productId,
    name,
    sku,
    price,
  });

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
export async function handleUpdateProduct(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");
  const name = payload.name || "";
  const sku = payload.sku || "";
  const price = Number(payload.price || 0);

  logger.info("Starting handleUpdateProduct", {
    externalId,
    name,
    sku,
    price,
  });

  if (!externalId) {
    logger.info("No external_id found; creating the Odoo product instead");
    return handleCreateProduct(context, payload);
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
export async function handleDeleteProduct(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { configVars, logger } = context;
  const externalId = String(payload.external_id || "");

  logger.info("Starting handleDeleteProduct", {
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
