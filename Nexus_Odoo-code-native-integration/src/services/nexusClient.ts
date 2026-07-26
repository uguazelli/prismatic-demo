import type { FlowExecutionContext } from "@prismatic-io/spectral";
import axios from "axios";

export interface CustomerPayload {
  action?: string;
  event_id?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  external_id?: string | null;
  synchronization_result?: string;
}

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
  payload: CustomerPayload,
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
