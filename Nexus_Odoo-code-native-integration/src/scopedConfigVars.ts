import {
  OrganizationActivatedConnectionConfigVar,
  CustomerActivatedConnectionConfigVar,
} from "@prismatic-io/spectral";

const odooReusableConnection = (
  stableKey:
    | "odoo-connection"
    | "odoo-connection-nexus"
    | "odoo"
    | (string & {})
):
  | OrganizationActivatedConnectionConfigVar
  | CustomerActivatedConnectionConfigVar => ({
  stableKey,
  dataType: "connection",
});
export const scopedConfigVars = {
  Odoo: odooReusableConnection("odoo"),
};
