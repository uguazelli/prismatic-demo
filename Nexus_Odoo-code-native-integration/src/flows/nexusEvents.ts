import { flow } from "@prismatic-io/spectral";
import { executeNexusEventSync } from "../services/nexus-events";

export const nexusEvents = flow({
  name: "Nexus Events",
  stableKey: "contact",
  description:
    "Routes Commerce Nexus customer and product events to the corresponding Odoo synchronization service",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onExecution: executeNexusEventSync,
});

export default nexusEvents;
