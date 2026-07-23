import { configPages } from "./configPages";

describe("Odoo configuration experience", () => {
  it("asks the customer to configure Odoo and the Nexus callback", () => {
    expect(Object.keys(configPages)).toEqual(["Connections"]);
    expect(Object.keys(configPages.Connections.elements)).toEqual([
      "Odoo Connection",
      "Nexus Connection",
    ]);
  });

  it("keeps the Nexus API key in a write-only connection field", () => {
    const nexus = configPages.Connections.elements["Nexus Connection"];

    expect(nexus.stableKey).toBe("0d8322f6-3504-4b52-8d69-9efeb6b39e13");
    expect(nexus.inputs.callbackUrl).toMatchObject({
      type: "string",
      required: true,
      permissionAndVisibilityType: "customer",
    });
    expect(nexus.inputs.apiKey).toMatchObject({
      type: "password",
      required: true,
      writeOnly: true,
      permissionAndVisibilityType: "customer",
    });
  });

  it("preserves the connection's stable identity", () => {
    expect(configPages.Connections.elements["Odoo Connection"].stableKey).toBe(
      "65992f5a-ea03-40d1-865b-b10ec0e12870",
    );
  });

  it("keeps the API key customer-managed and write-only", () => {
    const values = configPages.Connections.elements["Odoo Connection"].connection.values;

    expect(values).toMatchObject({
      baseUrl: { value: "", permissionAndVisibilityType: "customer" },
      port: { value: "", permissionAndVisibilityType: "customer" },
      db: { value: "", permissionAndVisibilityType: "customer" },
    });
    expect(values.apiKey).toMatchObject({
      value: "",
      permissionAndVisibilityType: "customer",
      writeOnly: true,
    });
  });
});
