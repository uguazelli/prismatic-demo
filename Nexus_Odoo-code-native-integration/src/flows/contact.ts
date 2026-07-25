import { flow } from "@prismatic-io/spectral";
import {
  handleCreateContact,
  handleUpdateContact,
  handleDeleteContact,
  CustomerPayload,
} from "../services/odooSync";

export const contact = flow({
  name: "Contact",
  stableKey: "contact",
  description: "Synchronizes Contact/Customer records between Commerce Nexus and Odoo ERP",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onExecution: async (context, params) => {
    const { logger } = context;

    // Safely extract payload from webhook body
    const rawBody = (params.onTrigger as any)?.results?.body ?? (params.onTrigger as any)?.body ?? (params.onTrigger as any)?.data ?? params.onTrigger;
    const payload: CustomerPayload = rawBody?.data ?? rawBody ?? {};

    const action = String(payload.action || "create").toLowerCase();

    logger.info(`Received Contact event trigger [action=${action}]`, {
      action,
      id: payload.id || payload.entity_id,
      name: payload.name,
      email: payload.email,
    });

    if (action === "create") {
      const result = await handleCreateContact(context, payload);
      return { data: result };
    } else if (action === "update") {
      const result = await handleUpdateContact(context, payload);
      return { data: result };
    } else if (action === "delete") {
      const result = await handleDeleteContact(context, payload);
      return { data: result };
    } else {
      logger.warn(`Unhandled event action '${action}'`, { payload });
      return { data: `Ignored action '${action}'` };
    }
  },
});

export default contact;
