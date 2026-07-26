import { flow } from "@prismatic-io/spectral";
import { executeContactSync } from "../services/contactSync";

export const contact = flow({
  name: "Contact",
  stableKey: "contact",
  description:
    "Synchronizes Contact/Customer records between Commerce Nexus and Odoo ERP",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onExecution: executeContactSync,
});

export default contact;
