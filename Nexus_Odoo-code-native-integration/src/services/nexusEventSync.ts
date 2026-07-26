import type { FlowOnExecution, TriggerPayload } from "@prismatic-io/spectral";
import { syncContactEvent } from "./contactSync";
import type { NexusEventPayload } from "./nexusClient";
import { syncProductEvent } from "./productSync";

export const executeNexusEventSync: FlowOnExecution<TriggerPayload> = async (
  context,
  params,
) => {
  const { logger } = context;
  const payload = params.onTrigger.results.body.data as NexusEventPayload;
  const entityType = String(payload.entity_type || "").toLowerCase();

  logger.info(`Received Nexus event [entity_type=${entityType}]`, {
    entityType,
    action: payload.action,
    eventId: payload.event_id,
    entityId: payload.id || payload.entity_id,
  });

  switch (entityType) {
    case "customer":
      return { data: await syncContactEvent(context, payload) };
    case "product":
      return { data: await syncProductEvent(context, payload) };
    case "order":
      logger.info("Order synchronization is not implemented; event ignored", {
        payload,
      });
      return {
        data: {
          ignored: true,
          entityType,
          reason: "Order synchronization is not implemented",
        },
      };
    default:
      logger.warn(`Unhandled Nexus entity type '${entityType}'`, { payload });
      return {
        data: {
          ignored: true,
          entityType,
          reason: `Unhandled entity type '${entityType}'`,
        },
      };
  }
};
