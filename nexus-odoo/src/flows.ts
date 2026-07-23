/**
 * Lists records from the Odoo model supplied in the webhook payload.
 */

import { flow } from "@prismatic-io/spectral";
import odooActions from "./manifests/odoo/actions";

const DEFAULT_ODOO_MODEL = "res.partner";

interface OdooListRecordsResult {
  data: unknown[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const resolveOdooModel = (payload: unknown): string => {
  if (!isRecord(payload) || payload.model == null) {
    return DEFAULT_ODOO_MODEL;
  }

  if (typeof payload.model !== "string") {
    throw new Error('Invalid request: "model" must be a string');
  }

  return payload.model.trim() || DEFAULT_ODOO_MODEL;
};

export const listOdooRecords = flow({
  name: "List Odoo Records",
  stableKey: "de2361bd-6d44-47f8-b733-564bf3851b0c",
  description: "Fetch up to 100 records from an Odoo model supplied at runtime",
  onExecution: async (context, params) => {
    const model = resolveOdooModel(params.onTrigger.results.body.data);

    context.logger.info(`Fetching records from Odoo model "${model}"`);

    const result = await odooActions.listRecords.perform<OdooListRecordsResult>({
      connection: context.configVars["Odoo Connection"],
      model,
      fetchAll: false,
      limit: "100",
      offset: "0",
    });

    context.logger.info(`Fetched ${result.data.length} Odoo records`);

    return { data: result.data };
  },
});

export default [listOdooRecords];
