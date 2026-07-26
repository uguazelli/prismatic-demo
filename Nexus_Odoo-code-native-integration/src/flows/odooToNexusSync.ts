import { flow } from "@prismatic-io/spectral";
import { executeOdooToNexusSync } from "../services/odooToNexusSync";

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
  onExecution: executeOdooToNexusSync,
});

export default odooToNexusSync;
