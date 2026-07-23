import { configPages } from "./configPages";
import { scopedConfigVars } from "./scopedConfigVars";

describe("integration config variables", () => {
  it("does not register the same key on config pages and in scoped variables", () => {
    const pageKeys = Object.values(configPages).flatMap((page) =>
      Object.keys(page.elements),
    );
    const scopedKeys = Object.keys(scopedConfigVars);
    const duplicates = pageKeys.filter((key) => scopedKeys.includes(key));

    expect(duplicates).toEqual([]);
  });
});
