import { configPages } from "./configPages";

describe("Odoo configuration experience", () => {
  it("only asks the customer to configure the Odoo connection", () => {
    expect(Object.keys(configPages)).toEqual(["Connections"]);
    expect(Object.keys(configPages.Connections.elements)).toEqual(["Odoo Connection"]);
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
