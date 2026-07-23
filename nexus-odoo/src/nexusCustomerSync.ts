/**
 * Receives Commerce Nexus customer events, upserts an Odoo contact, and sends
 * the synchronization result back to Commerce Nexus.
 */

import { flow, type Connection } from "@prismatic-io/spectral";
import axios from "axios";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import odooActions from "./manifests/odoo/actions";

const ODOO_CONTACT_MODEL = "res.partner";
const NEXUS_EXTERNAL_ID_MODULE = "nexus";
const MAX_OPERATION_ATTEMPTS = 3;

type NexusCustomerEventType = "customer.created" | "customer.updated";
type OdooOperation = "created" | "updated";

export interface NexusCustomerPayload {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface NexusCustomerEvent {
  event_id: string;
  event_type: NexusCustomerEventType;
  entity_type: "customer";
  entity_id: string;
  tenant_id: string;
  occurred_at: string;
  payload: NexusCustomerPayload;
}

export interface OdooPartnerValues {
  name: string;
  email: string;
  phone: string | false;
}

export interface OdooPartner {
  id: number | string;
}

export interface OdooContactRepository {
  findByExternalId(externalId: string): Promise<OdooPartner | null>;
  create(values: OdooPartnerValues, externalId: string): Promise<number | string>;
  update(id: number | string, values: OdooPartnerValues): Promise<void>;
}

export interface OdooUpsertResult {
  externalId: string;
  operation: OdooOperation;
  recordId: string;
}

export interface NexusCallbackPayload {
  event_id: string;
  entity_type: "customer";
  entity_id: string;
  external_id?: string;
  synchronization_result: "success" | "failed";
  synchronization_error?: string;
  metadata: {
    prismatic_execution_id: string;
    odoo_external_id: string;
    odoo_model: typeof ODOO_CONTACT_MODEL;
    odoo_operation?: OdooOperation;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid Nexus event: "${path}" must be a non-empty string`);
  }
  return value.trim();
};

const nullableString = (value: unknown, path: string): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid Nexus event: "${path}" must be a string or null`);
  }
  return value.trim() || null;
};

export const parseNexusCustomerEvent = (value: unknown): NexusCustomerEvent => {
  if (!isRecord(value)) {
    throw new Error("Invalid Nexus event: request body must be a JSON object");
  }

  const eventType = requiredString(value.event_type, "event_type");
  if (eventType !== "customer.created" && eventType !== "customer.updated") {
    throw new Error(
      'Invalid Nexus event: "event_type" must be "customer.created" or "customer.updated"',
    );
  }

  if (value.entity_type !== "customer") {
    throw new Error('Invalid Nexus event: "entity_type" must be "customer"');
  }

  if (!isRecord(value.payload)) {
    throw new Error('Invalid Nexus event: "payload" must be a JSON object');
  }

  const entityId = requiredString(value.entity_id, "entity_id");
  const payloadId = requiredString(value.payload.id, "payload.id");
  if (payloadId !== entityId) {
    throw new Error('Invalid Nexus event: "payload.id" must match "entity_id"');
  }

  return {
    event_id: requiredString(value.event_id, "event_id"),
    event_type: eventType,
    entity_type: "customer",
    entity_id: entityId,
    tenant_id: requiredString(value.tenant_id, "tenant_id"),
    occurred_at: requiredString(value.occurred_at, "occurred_at"),
    payload: {
      id: payloadId,
      name: requiredString(value.payload.name, "payload.name"),
      email: requiredString(value.payload.email, "payload.email"),
      phone: nullableString(value.payload.phone, "payload.phone"),
    },
  };
};

export const buildOdooExternalId = (entityId: string): string => {
  const name = entityId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!name) {
    throw new Error("Cannot build an Odoo external ID from an empty Nexus entity ID");
  }

  return `${NEXUS_EXTERNAL_ID_MODULE}.customer_${name}`;
};

export const mapCustomerToOdooPartner = (customer: NexusCustomerPayload): OdooPartnerValues => ({
  name: customer.name,
  email: customer.email,
  phone: customer.phone ?? false,
});

export const upsertOdooContact = async (
  event: NexusCustomerEvent,
  repository: OdooContactRepository,
): Promise<OdooUpsertResult> => {
  const externalId = buildOdooExternalId(event.entity_id);
  const values = mapCustomerToOdooPartner(event.payload);
  const existing = await repository.findByExternalId(externalId);

  if (existing) {
    await repository.update(existing.id, values);
    return { externalId, operation: "updated", recordId: String(existing.id) };
  }

  const recordId = await repository.create(values, externalId);
  return { externalId, operation: "created", recordId: String(recordId) };
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const isOdooRecordNotFoundError = (error: unknown): boolean => {
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    return true;
  }
  return /(?:external id.*not found|not found.*external id|\b404\b)/i.test(errorMessage(error));
};

const createOdooRepository = (connection: Connection): OdooContactRepository => ({
  findByExternalId: async (externalId) => {
    try {
      const result = await odooActions.getRecordByExternalId.perform<{
        data: OdooPartner | null;
      }>({ connection, externalId });
      return result.data ?? null;
    } catch (error) {
      if (isOdooRecordNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  },
  create: async (values, externalId) => {
    const result = await odooActions.createRecord.perform<{ data: number | string }>({
      connection,
      model: ODOO_CONTACT_MODEL,
      parameters: JSON.stringify(values),
      externalId,
    });
    return result.data;
  },
  update: async (id, values) => {
    await odooActions.updateRecord.perform({
      connection,
      model: ODOO_CONTACT_MODEL,
      id: String(id),
      parameters: JSON.stringify(values),
    });
  },
});

const connectionField = (connection: Connection, key: string): string => {
  const value = connection.fields[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Nexus Connection field "${key}" is required`);
  }
  return value.trim();
};

const nexusCallbackConfig = (connection: Connection): { apiKey: string; callbackUrl: string } => {
  const callbackUrl = connectionField(connection, "callbackUrl");
  const parsedUrl = new URL(callbackUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error('Nexus Connection field "callbackUrl" must use HTTP or HTTPS');
  }
  return {
    callbackUrl: parsedUrl.toString(),
    apiKey: connectionField(connection, "apiKey"),
  };
};

const retry = async <T>(
  operation: () => Promise<T>,
  attempts = MAX_OPERATION_ATTEMPTS,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(250 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
};

export const postNexusCallback = async (
  connection: Connection,
  payload: NexusCallbackPayload,
): Promise<void> => {
  const { apiKey, callbackUrl } = nexusCallbackConfig(connection);
  await retry(async () => {
    await axios.post(callbackUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      timeout: 10_000,
    });
  });
};

export const syncNexusCustomerToOdoo = flow({
  name: "Sync Nexus Customer to Odoo",
  stableKey: "05ad3c8f-afdc-4e7a-b17e-3792eb3e67f7",
  description: "Create or update an Odoo contact from a Commerce Nexus customer event",
  endpointSecurityType: "customer_required",
  onExecution: async (context, params) => {
    const event = parseNexusCustomerEvent(params.onTrigger.results.body.data);
    const odooConnection = context.configVars["Odoo Connection"];
    const nexusConnection = context.configVars["Nexus Connection"];
    const repository = createOdooRepository(odooConnection);
    const odooExternalId = buildOdooExternalId(event.entity_id);

    context.logger.info("Processing Commerce Nexus customer event", {
      eventId: event.event_id,
      eventType: event.event_type,
      entityId: event.entity_id,
      odooExternalId,
    });

    let result: OdooUpsertResult;
    try {
      result = await retry(() => upsertOdooContact(event, repository));
    } catch (error) {
      const message = errorMessage(error);
      const callback: NexusCallbackPayload = {
        event_id: event.event_id,
        entity_type: "customer",
        entity_id: event.entity_id,
        synchronization_result: "failed",
        synchronization_error: message.slice(0, 2_000),
        metadata: {
          prismatic_execution_id: context.executionId,
          odoo_external_id: odooExternalId,
          odoo_model: ODOO_CONTACT_MODEL,
        },
      };

      try {
        await postNexusCallback(nexusConnection, callback);
      } catch (callbackError) {
        context.logger.error("Unable to report synchronization failure to Commerce Nexus", {
          eventId: event.event_id,
          callbackError: errorMessage(callbackError),
        });
      }

      throw error;
    }

    const callback: NexusCallbackPayload = {
      event_id: event.event_id,
      entity_type: "customer",
      entity_id: event.entity_id,
      external_id: result.recordId,
      synchronization_result: "success",
      metadata: {
        prismatic_execution_id: context.executionId,
        odoo_external_id: result.externalId,
        odoo_model: ODOO_CONTACT_MODEL,
        odoo_operation: result.operation,
      },
    };

    // If this callback fails, let the execution fail. A replay is safe because
    // the deterministic Odoo external ID turns the repeated upsert into an update.
    await postNexusCallback(nexusConnection, callback);
    context.logger.info("Commerce Nexus customer synchronized", {
      eventId: event.event_id,
      entityId: event.entity_id,
      odooRecordId: result.recordId,
      operation: result.operation,
    });

    return { data: callback };
  },
});
