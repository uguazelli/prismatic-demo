/**
 * Your integration will contain one or more flows that each perform different
 * functions. When the flow is invoked, the onTrigger function runs first (if
 * defined), followed by the onExecution function.
 *
 * For information on code-native flows, see
 * https://prismatic.io/docs/integrations/code-native/flows/
 */

// Import core utilities for defining flow logic and handling conditional behavior
import { flow } from "@prismatic-io/spectral";

interface CustomerEventPayload {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  external_id?: string | null;
}

interface CustomerEvent {
  event_id: string;
  entity_id: string;
  payload: CustomerEventPayload;
}

interface OdooRecordResult {
  data: {
    id: number;
  };
}

interface OdooCreateResult {
  data: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const requireString = (
  value: unknown,
  fieldName: string,
  allowEmpty = false,
): string => {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid customer event: ${fieldName} must be a string`);
  }

  return value;
};

export const parseCustomerEvent = (value: unknown): CustomerEvent => {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new Error(
      "Invalid customer event: body.data.payload must be an object",
    );
  }

  const payload = value.payload;
  const phone = payload.phone;
  const externalId = payload.external_id;

  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    throw new Error(
      "Invalid customer event: payload.phone must be a string or null",
    );
  }
  if (
    externalId !== undefined &&
    externalId !== null &&
    typeof externalId !== "string"
  ) {
    throw new Error(
      "Invalid customer event: payload.external_id must be a string or null",
    );
  }

  return {
    event_id: requireString(value.event_id, "event_id"),
    entity_id: requireString(value.entity_id, "entity_id"),
    payload: {
      id: requireString(payload.id, "payload.id"),
      name: requireString(payload.name, "payload.name"),
      email: requireString(payload.email, "payload.email"),
      phone,
      external_id: externalId,
    },
  };
};

// Define a single flow within your integration
export const customer = flow({
  // Core metadata about the flow (name, stable key, description)
  name: "customer",
  stableKey: "customer",
  description: "",
  endpointSecurityType: "customer_required",
  onExecution: async (context, params) => {
    const { configVars } = context;
    const event = parseCustomerEvent(params.onTrigger.results.body.data);
    const { payload } = event;

    /* This string is the name of the branch that this conditional block resolves to. */
    let ifConditionIsMet: string;
    if (payload.external_id != null && payload.external_id !== "") {
      const getRecordById =
        await context.components.odoo.getRecordById<OdooRecordResult>({
          connection: configVars["Odoo Connection"],
          id: payload.external_id,
          model: "res.partner",
        });

      const customerFields = Object.fromEntries(
        Object.entries({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
        }).filter(([, value]) => value !== undefined && value !== null),
      );

      await context.components.odoo.updateRecord({
        connection: configVars["Odoo Connection"],
        id: String(getRecordById.data.id),
        model: "res.partner",
        parameters: JSON.stringify(customerFields),
      });
      ifConditionIsMet = "has odoo id";
    } else {
      const createRecord =
        await context.components.odoo.createRecord<OdooCreateResult>({
          connection: configVars["Odoo Connection"],
          externalId: "",
          model: "res.partner",
          parameters: JSON.stringify({
            name: payload.name,
            email: payload.email,
            ...(payload.phone == null ? {} : { phone: payload.phone }),
            company_type: "person",
            type: "contact",
            customer_rank: 1,
          }),
        });

      await context.components.http.httpPost({
        connection: undefined,
        data: JSON.stringify({
          event_id: event.event_id,
          entity_type: "customer",
          entity_id: event.entity_id,
          external_id: String(createRecord.data),
          synchronization_result: "success",
          metadata: {
            source: "prismatic",
          },
        }),
        debugRequest: false,
        headers: [],
        ignoreSslErrors: false,
        includeFullResponse: false,
        maxRedirects: "5",
        maxRetries: "0",
        queryParams: [],
        responseType: "json",
        retryDelayMS: "0",
        retryOnAllErrors: false,
        timeout: "",
        url: "https://prismatic-nexus.veridatapro.com/webhooks/odoo",
        useExponentialBackoff: false,
      });
      ifConditionIsMet = "Else";
    }
    return { data: ifConditionIsMet };
  },
});

export default customer;
