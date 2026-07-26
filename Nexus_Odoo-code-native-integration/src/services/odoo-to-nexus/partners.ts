import { actions as odooActions } from "@component-manifests/odoo";
import type { Connection } from "@prismatic-io/spectral";
import type { NexusEventPayload } from "../nexus/types";

export interface OdooPartner {
  id: number;
  name?: string | false;
  email?: string | false;
  phone?: string | false;
  write_date?: string;
  active?: boolean;
}

interface ComponentActionResult {
  data?: unknown;
}

export async function searchOdooPartners(
  connection: Connection,
  active: boolean,
  lastPollTime: string,
): Promise<OdooPartner[]> {
  const result =
    await odooActions.rawHttpRequest.perform<ComponentActionResult>({
      connection,
      url: "/json/2/res.partner/search_read",
      method: "POST",
      data: JSON.stringify({
        context: { active_test: false },
        domain: [
          ["active", "=", active],
          ["write_date", ">=", lastPollTime],
        ],
        fields: ["id", "name", "email", "phone", "write_date", "active"],
      }),
      headers: { "Content-Type": "application/json" },
      responseType: "json",
    });

  if (!Array.isArray(result?.data)) {
    throw new TypeError("Odoo search_read returned an unexpected response");
  }

  return result.data as OdooPartner[];
}

export function buildCustomerSyncPayload(
  partner: OdooPartner,
): NexusEventPayload {
  return {
    action: "sync",
    entity_type: "customer",
    external_id: String(partner.id),
    name:
      typeof partner.name === "string" && partner.name
        ? partner.name
        : undefined,
    email:
      typeof partner.email === "string" && partner.email
        ? partner.email
        : undefined,
    phone: typeof partner.phone === "string" ? partner.phone : undefined,
    synchronization_result: "success",
  };
}

export function buildCustomerDeletePayload(
  partner: OdooPartner,
): NexusEventPayload {
  return {
    action: "delete",
    entity_type: "customer",
    external_id: String(partner.id),
    synchronization_result: "success",
  };
}
