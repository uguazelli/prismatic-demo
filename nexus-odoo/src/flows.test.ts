import { resolveOdooModel } from "./flows";

describe("resolveOdooModel", () => {
  it("defaults to res.partner when the payload omits a model", () => {
    expect(resolveOdooModel(undefined)).toBe("res.partner");
    expect(resolveOdooModel({})).toBe("res.partner");
    expect(resolveOdooModel({ model: "  " })).toBe("res.partner");
  });

  it("accepts any model name supplied by the caller", () => {
    expect(resolveOdooModel({ model: "sale.order" })).toBe("sale.order");
    expect(resolveOdooModel({ model: "  product.product  " })).toBe("product.product");
  });

  it("rejects non-string model values", () => {
    expect(() => resolveOdooModel({ model: 42 })).toThrow(
      'Invalid request: "model" must be a string',
    );
  });
});
