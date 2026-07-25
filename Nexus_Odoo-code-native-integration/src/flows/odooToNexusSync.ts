import { actions as odooActions } from "@component-manifests/odoo";
import { Connection, flow } from "@prismatic-io/spectral";
import axios from "axios";
import { CustomerPayload } from "../services/odooSync";

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    return {
      error: error.message,
      status: error.response?.status,
      response: error.response?.data,
    };
  }

  return { error: getErrorMessage(error) };
}

export function buildCustomerSyncPayload(
  partner: OdooPartner,
): CustomerPayload {
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

export const odooToNexusSync = flow({
  name: "Odoo to Nexus Sync",
  stableKey: "odoo-to-nexus-sync",
  description:
    "Polls Odoo ERP for newly created, updated, or archived contacts since the last poll execution",
  isSynchronous: false,
  schedule: {
    configVar: "Odoo Sync Schedule",
  },
  queueConfig: {
    singletonExecutions: true,
  },
  onExecution: async (context) => {
    const { configVars, logger, instanceState } = context;

    // 1. Get last poll timestamp from Prismatic instanceState (default fallback: 1 hour ago)
    const defaultStartTime = new Date(Date.now() - 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const lastPollTime =
      (instanceState.lastPollTime as string) || defaultStartTime;
    const currentRunTime = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    logger.info(
      `Starting Delta Odoo -> Nexus Sync [lastPollTime=${lastPollTime}]`,
    );

    try {
      const baseUrl = String(configVars["App Base URL"] || "").replace(
        /\/$/,
        "",
      );
      const apiKey = String(configVars["App API Key"] || "demo-acme-api-key");

      // 2. Query Created / Updated Partners (active = true, write_date >= lastPollTime)
      const activePartners = await searchOdooPartners(
        configVars.Odoo,
        true,
        lastPollTime,
      );

      // 3. Query Archived / Deleted Partners (active = false, write_date >= lastPollTime)
      const archivedPartners = await searchOdooPartners(
        configVars.Odoo,
        false,
        lastPollTime,
      );

      logger.info(
        `Delta scan found ${activePartners.length} created/updated and ${archivedPartners.length} archived partners in Odoo`,
      );

      let syncedCount = 0;
      let failedCount = 0;

      // Sync Active (Created / Updated) Contacts
      for (const partner of activePartners) {
        if (!partner || (!partner.name && !partner.email)) continue;

        const customerPayload = buildCustomerSyncPayload(partner);

        try {
          await axios.post(`${baseUrl}/webhooks/odoo`, customerPayload, {
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey,
            },
            timeout: 10000,
          });
          syncedCount++;
        } catch (error: unknown) {
          failedCount++;
          logger.warn(`Failed to sync active Odoo partner ${partner.id}`, {
            ...getErrorDetails(error),
          });
        }
      }

      // Sync Archived / Deleted Contacts
      for (const partner of archivedPartners) {
        const deletePayload: CustomerPayload = {
          action: "delete",
          entity_type: "customer",
          external_id: String(partner.id),
          synchronization_result: "success",
        };

        try {
          await axios.post(`${baseUrl}/webhooks/odoo`, deletePayload, {
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey,
            },
            timeout: 10000,
          });
          syncedCount++;
        } catch (error: unknown) {
          failedCount++;
          logger.warn(`Failed to sync deleted Odoo partner ${partner.id}`, {
            ...getErrorDetails(error),
          });
        }
      }

      if (failedCount > 0) {
        throw new Error(
          `Failed to sync ${failedCount} Odoo partner${failedCount === 1 ? "" : "s"}; the delta cursor was not advanced`,
        );
      }

      // 4. Persist execution timestamp in instanceState for next poll cycle
      instanceState.lastPollTime = currentRunTime;

      logger.info(
        `Completed Delta Sync. Total records processed: ${syncedCount}`,
      );
      return {
        data: `Synced ${syncedCount} changed records (Active: ${activePartners.length}, Archived: ${archivedPartners.length})`,
      };
    } catch (error: unknown) {
      logger.error("Error executing Delta Odoo Sync", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  },
});

export default odooToNexusSync;
