import { actions as odooActions } from "@component-manifests/odoo";
import { Connection } from "@prismatic-io/spectral";
import { configPages } from "../configPages";
import { odooToNexusSync, searchOdooPartners } from "./odooToNexusSync";

jest.mock("@component-manifests/odoo", () => ({
  actions: {
    rawHttpRequest: {
      perform: jest.fn(),
    },
  },
}));

const rawHttpRequest = odooActions.rawHttpRequest.perform as jest.Mock;

describe("Odoo to Nexus scheduled sync", () => {
  it("uses the customer-configurable schedule", () => {
    expect(odooToNexusSync.schedule).toEqual({
      configVar: "Odoo Sync Schedule",
    });
    expect(odooToNexusSync.queueConfig).toEqual({
      singletonExecutions: true,
    });
    expect(odooToNexusSync).not.toHaveProperty("triggerType", "polling");
    expect(odooToNexusSync).not.toHaveProperty("onTrigger");
  });

  it("exposes the schedule in the customer config wizard", () => {
    const schedule = configPages.Configuration.elements["Odoo Sync Schedule"];

    expect(schedule).toMatchObject({
      stableKey: "odooSyncSchedule",
      dataType: "schedule",
      permissionAndVisibilityType: "customer",
      defaultValue: "*/15 * * * *",
    });
  });

  it("queries changed Odoo partners through the supported JSON-2 action", async () => {
    const partners = [{ id: 42, name: "Acme", active: false }];
    rawHttpRequest.mockResolvedValueOnce({ data: partners });

    await expect(
      searchOdooPartners({} as Connection, false, "2026-07-25 10:00:00"),
    ).resolves.toEqual(partners);

    expect(rawHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/json/2/res.partner/search_read",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        responseType: "json",
      }),
    );

    const request = rawHttpRequest.mock.calls[0][0];
    expect(JSON.parse(request.data)).toEqual({
      context: { active_test: false },
      domain: [
        ["active", "=", false],
        ["write_date", ">=", "2026-07-25 10:00:00"],
      ],
      fields: ["id", "name", "email", "phone", "write_date", "active"],
    });
  });

  it("rejects an unexpected Odoo response instead of silently skipping it", async () => {
    rawHttpRequest.mockResolvedValueOnce({
      data: { error: "invalid response" },
    });

    await expect(
      searchOdooPartners({} as Connection, true, "2026-07-25 10:00:00"),
    ).rejects.toThrow("Odoo search_read returned an unexpected response");
  });
});
