import type { FlowExecutionContext } from "@prismatic-io/spectral";
import type { NexusEventPayload } from "./nexusClient";
import {
  handleCreateProduct,
  handleDeleteProduct,
  handleUpdateProduct,
} from "./odooProducts";

export async function syncProductEvent(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
) {
  const { logger } = context;
  const action = String(payload.action || "create").toLowerCase();

  logger.info(`Received Product event trigger [action=${action}]`, {
    action,
    id: payload.id || payload.entity_id,
    name: payload.name,
    sku: payload.sku,
  });

  switch (action) {
    case "create":
      return handleCreateProduct(context, payload);
    case "update":
      return handleUpdateProduct(context, payload);
    case "delete":
      return handleDeleteProduct(context, payload);
    default:
      logger.warn(`Unhandled event action '${action}'`, { payload });
      return `Ignored action '${action}'`;
  }
}
