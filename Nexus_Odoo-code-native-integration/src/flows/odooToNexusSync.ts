import { flow } from "@prismatic-io/spectral";
import axios from "axios";
import { CustomerPayload } from "../services/odooSync";

export const odooToNexusSync = flow({
  name: "Odoo to Nexus Sync",
  stableKey: "odoo-to-nexus-sync",
  description: "Polls Odoo ERP for newly created, updated, or archived contacts since the last poll execution",
  isSynchronous: false,
  triggerType: "polling",
  schedule: {
    value: "*/15 * * * *",
  },
  onTrigger: (async (context: any) => {
    return { data: [] };
  }) as any,
  onExecution: async (context, params) => {
    const { configVars, logger, components, instanceState } = context;

    // 1. Get last poll timestamp from Prismatic instanceState (default fallback: 1 hour ago)
    const defaultStartTime = new Date(Date.now() - 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const lastPollTime = (instanceState.lastPollTime as string) || defaultStartTime;
    const currentRunTime = new Date().toISOString().replace("T", " ").substring(0, 19);

    logger.info(`Starting Delta Odoo -> Nexus Sync [lastPollTime=${lastPollTime}]`);

    try {
      const baseUrl = String(configVars["App Base URL"] || "").replace(/\/$/, "");
      const apiKey = String(configVars["App API Key"] || "demo-acme-api-key");

      // 2. Query Created / Updated Partners (active = true, write_date >= lastPollTime)
      const activePartners = (await (components as any).odoo.searchReadRecords({
        connection: configVars["Odoo"],
        model: "res.partner",
        domain: JSON.stringify([
          ["active", "=", true],
          ["write_date", ">=", lastPollTime],
        ]),
        fields: JSON.stringify(["id", "name", "email", "phone", "write_date"]),
      })) as any[];

      // 3. Query Archived / Deleted Partners (active = false, write_date >= lastPollTime)
      const archivedPartners = (await (components as any).odoo.searchReadRecords({
        connection: configVars["Odoo"],
        model: "res.partner",
        domain: JSON.stringify([
          ["active", "=", false],
          ["write_date", ">=", lastPollTime],
        ]),
        fields: JSON.stringify(["id", "name", "email", "phone", "write_date"]),
      })) as any[];

      const activeList = Array.isArray(activePartners) ? activePartners : [];
      const archivedList = Array.isArray(archivedPartners) ? archivedPartners : [];

      logger.info(
        `Delta scan found ${activeList.length} created/updated and ${archivedList.length} archived partners in Odoo`
      );

      let syncedCount = 0;

      // Sync Active (Created / Updated) Contacts
      for (const partner of activeList) {
        if (!partner || (!partner.name && !partner.email)) continue;

        const customerPayload: CustomerPayload = {
          action: "sync",
          external_id: String(partner.id),
          name: partner.name || "",
          email: partner.email || "",
          phone: partner.phone || "",
        };

        try {
          await axios.post(`${baseUrl}/webhooks/odoo`, customerPayload, {
            headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
            timeout: 10000,
          });
          syncedCount++;
        } catch (err: any) {
          logger.warn(`Failed to sync active Odoo partner ${partner.id}`, { error: err.message });
        }
      }

      // Sync Archived / Deleted Contacts
      for (const partner of archivedList) {
        const deletePayload: CustomerPayload = {
          action: "delete",
          external_id: String(partner.id),
        };

        try {
          await axios.post(`${baseUrl}/webhooks/odoo`, deletePayload, {
            headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
            timeout: 10000,
          });
          syncedCount++;
        } catch (err: any) {
          logger.warn(`Failed to sync deleted Odoo partner ${partner.id}`, { error: err.message });
        }
      }

      // 4. Persist execution timestamp in instanceState for next poll cycle
      instanceState.lastPollTime = currentRunTime;

      logger.info(`Completed Delta Sync. Total records processed: ${syncedCount}`);
      return {
        data: `Synced ${syncedCount} changed records (Active: ${activeList.length}, Archived: ${archivedList.length})`,
      };
    } catch (error: any) {
      logger.error("Error executing Delta Odoo Sync", { error: error.message });
      throw error;
    }
  },
});

export default odooToNexusSync;
