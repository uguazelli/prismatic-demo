import { isEqual } from "@prismatic-io/spectral/dist/conditionalLogic";
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

// Define a single flow within your integration
export const contact = flow({
  name: "Contact",
  stableKey: "contact",
  description: "",
  isSynchronous: true,
  endpointSecurityType: "customer_optional",
  onExecution: async (context, params) => {
    const { configVars } = context;
    const triggerBody = (params.onTrigger as any)?.results?.body ?? (params.onTrigger as any)?.data ?? params.onTrigger;
    const payloadData = triggerBody?.data ?? triggerBody;
    const action = payloadData?.action;

    let resultStatus: string;
    if (isEqual(action, "create")) {
      await context.components.crossFlow.invokeFlow({
        data: payloadData,
        flowName: "Contact Create",
      });
      resultStatus = "Create";
    } else if (isEqual(action, "update")) {
      await context.components.crossFlow.invokeFlow({
        data: payloadData,
        flowName: "Contact Update",
      });
      resultStatus = "Update";
    } else if (isEqual(action, "delete")) {
      await context.components.crossFlow.invokeFlow({
        data: payloadData,
        flowName: "Contact Delete",
      });
      resultStatus = "Delete";
    } else {
      resultStatus = "Else";
    }
    return { data: resultStatus };
  },
});

export default contact;
