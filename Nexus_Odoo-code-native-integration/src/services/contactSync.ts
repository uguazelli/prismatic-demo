import type { FlowOnExecution, TriggerPayload } from "@prismatic-io/spectral";
import {
  handleCreateContact,
  handleDeleteContact,
  handleUpdateContact,
  type CustomerPayload,
} from "./odooSync";

export const executeContactSync: FlowOnExecution<TriggerPayload> = async (
  context,
  params,
) => {
  const { logger } = context;
  const payload = params.onTrigger.results.body.data as CustomerPayload;
  const action = String(payload.action || "create").toLowerCase();

  logger.info(`Received Contact event trigger [action=${action}]`, {
    action,
    id: payload.id || payload.entity_id,
    name: payload.name,
    email: payload.email,
  });

  switch (action) {
    case "create":
      return { data: await handleCreateContact(context, payload) };
    case "update":
      return { data: await handleUpdateContact(context, payload) };
    case "delete":
      return { data: await handleDeleteContact(context, payload) };
    default:
      logger.warn(`Unhandled event action '${action}'`, { payload });
      return { data: `Ignored action '${action}'` };
  }
};
