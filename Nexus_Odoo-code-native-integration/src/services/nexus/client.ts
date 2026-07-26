import type { FlowExecutionContext } from "@prismatic-io/spectral";
import axios from "axios";
import type { NexusCallbackPayload, NexusEventPayload } from "./types";

export function getErrorDetails(error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    return {
      error: error.message,
      status: error.response?.status,
      response: error.response?.data,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
  };
}

export async function postNexusWebhook(
  context: FlowExecutionContext,
  payload: NexusEventPayload | NexusCallbackPayload,
): Promise<unknown> {
  const baseUrl = String(context.configVars["App Base URL"] || "").replace(
    /\/$/,
    "",
  );
  const apiKey = String(context.configVars["App API Key"] || "");

  if (!apiKey) {
    throw new Error("App API Key is required");
  }

  const response = await axios.post<unknown>(
    `${baseUrl}/webhooks/odoo`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      timeout: 10000,
    },
  );

  return response.data;
}

/** Reports a completed Odoo operation without emitting another Nexus event. */
export async function notifyNexusCallback(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
  entityType: "customer" | "product",
  odooId?: string,
): Promise<unknown> {
  const { logger } = context;
  const entityId = payload.id || payload.entity_id || "";
  const callbackBody: NexusCallbackPayload = {
    event_id: payload.event_id || entityId,
    entity_type: entityType,
    entity_id: entityId,
    external_id: odooId || payload.external_id || undefined,
    synchronization_result: "success",
  };

  logger.info("Posting completion status to Nexus /webhooks/odoo", {
    callbackBody,
  });

  try {
    const response = await postNexusWebhook(context, callbackBody);
    logger.info("Nexus callback succeeded", { entityType, entityId });
    return response;
  } catch (error: unknown) {
    logger.error("Nexus callback failed", getErrorDetails(error));
    throw error;
  }
}
