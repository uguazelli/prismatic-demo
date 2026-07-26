import type { FlowExecutionContext } from "@prismatic-io/spectral";
import { getErrorDetails, postNexusWebhook } from "../nexus/client";
import type { NexusEventPayload } from "../nexus/types";
import {
  buildCustomerDeletePayload,
  buildCustomerSyncPayload,
  searchOdooPartners,
  type OdooPartner,
} from "./partners";

interface SyncItem {
  partner: OdooPartner;
  payload: NexusEventPayload;
  type: "active" | "deleted";
}

function formatOdooTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function buildSyncItems(
  activePartners: OdooPartner[],
  archivedPartners: OdooPartner[],
): SyncItem[] {
  const activeItems = activePartners
    .filter((partner) => partner.name || partner.email)
    .map((partner) => ({
      partner,
      payload: buildCustomerSyncPayload(partner),
      type: "active" as const,
    }));
  const deletedItems = archivedPartners.map((partner) => ({
    partner,
    payload: buildCustomerDeletePayload(partner),
    type: "deleted" as const,
  }));

  return [...activeItems, ...deletedItems];
}

async function syncItemsToNexus(
  context: FlowExecutionContext,
  items: SyncItem[],
): Promise<{ syncedCount: number; failedCount: number }> {
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      await postNexusWebhook(context, item.payload);
      syncedCount++;
    } catch (error: unknown) {
      failedCount++;
      context.logger.warn(
        `Failed to sync ${item.type} Odoo partner ${item.partner.id}`,
        getErrorDetails(error),
      );
    }
  }

  return { syncedCount, failedCount };
}

export async function executeOdooToNexusSync(context: FlowExecutionContext) {
  const { configVars, logger, instanceState } = context;
  const currentRunTime = formatOdooTimestamp(new Date());
  const defaultStartTime = formatOdooTimestamp(
    new Date(Date.now() - 60 * 60 * 1000),
  );
  const lastPollTime =
    (instanceState.lastPollTime as string | undefined) ?? defaultStartTime;

  logger.info(
    `Starting Delta Odoo -> Nexus Sync [lastPollTime=${lastPollTime}]`,
  );

  try {
    if (!configVars["App API Key"]) {
      throw new Error("App API Key is required");
    }

    const [activePartners, archivedPartners] = await Promise.all([
      searchOdooPartners(configVars.Odoo, true, lastPollTime),
      searchOdooPartners(configVars.Odoo, false, lastPollTime),
    ]);

    logger.info(
      `Delta scan found ${activePartners.length} created/updated and ${archivedPartners.length} archived partners in Odoo`,
    );

    const items = buildSyncItems(activePartners, archivedPartners);
    const { syncedCount, failedCount } = await syncItemsToNexus(context, items);

    if (failedCount > 0) {
      throw new Error(
        `Failed to sync ${failedCount} Odoo partner${failedCount === 1 ? "" : "s"}; the delta cursor was not advanced`,
      );
    }

    instanceState.lastPollTime = currentRunTime;

    logger.info(
      `Completed Delta Sync. Total records processed: ${syncedCount}`,
    );
    return {
      data: `Synced ${syncedCount} changed records (Active: ${activePartners.length}, Archived: ${archivedPartners.length})`,
    };
  } catch (error: unknown) {
    logger.error("Error executing Delta Odoo Sync", getErrorDetails(error));
    throw error;
  }
}
