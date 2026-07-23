import type { Connection } from "@prismatic-io/spectral";
import axios from "axios";
import {
  buildOdooExternalId,
  mapCustomerToOdooPartner,
  parseNexusCustomerEvent,
  postNexusCallback,
  upsertOdooContact,
  type NexusCallbackPayload,
  type NexusCustomerEvent,
  type OdooContactRepository,
} from "./nexusCustomerSync";

const event: NexusCustomerEvent = {
  event_id: "evt-1001",
  event_type: "customer.created",
  entity_type: "customer",
  entity_id: "18F17023-3D65-45DA-A876-3FF6CA8B74E5",
  tenant_id: "tenant-acme",
  occurred_at: "2026-07-23T19:49:31+00:00",
  payload: {
    id: "18F17023-3D65-45DA-A876-3FF6CA8B74E5",
    name: "Northwind Buyer Inc",
    email: "buyer@northwind.example",
    phone: null,
  },
};

const repository = (): OdooContactRepository => ({
  findByExternalId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
});

describe("Nexus customer event validation", () => {
  it("parses the Commerce Nexus customer envelope", () => {
    expect(parseNexusCustomerEvent(event)).toEqual(event);
  });

  it("rejects unsupported events", () => {
    expect(() => parseNexusCustomerEvent({ ...event, event_type: "product.created" })).toThrow(
      '"event_type" must be "customer.created" or "customer.updated"',
    );
  });

  it("rejects envelopes whose payload ID does not match the entity ID", () => {
    expect(() =>
      parseNexusCustomerEvent({ ...event, payload: { ...event.payload, id: "another-id" } }),
    ).toThrow('"payload.id" must match "entity_id"');
  });
});

describe("Odoo customer mapping", () => {
  it("builds an Odoo module.name external ID", () => {
    expect(buildOdooExternalId(event.entity_id)).toBe(
      "nexus.customer_18f17023_3d65_45da_a876_3ff6ca8b74e5",
    );
  });

  it("uses false to clear an empty Odoo phone field", () => {
    expect(mapCustomerToOdooPartner(event.payload)).toEqual({
      name: "Northwind Buyer Inc",
      email: "buyer@northwind.example",
      phone: false,
    });
  });
});

describe("Odoo contact upsert", () => {
  it("updates a contact found by its Nexus external ID", async () => {
    const repo = repository();
    vi.mocked(repo.findByExternalId).mockResolvedValue({ id: 42 });

    await expect(upsertOdooContact(event, repo)).resolves.toEqual({
      externalId: "nexus.customer_18f17023_3d65_45da_a876_3ff6ca8b74e5",
      operation: "updated",
      recordId: "42",
    });
    expect(repo.update).toHaveBeenCalledWith(42, {
      name: "Northwind Buyer Inc",
      email: "buyer@northwind.example",
      phone: false,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("creates a contact with the deterministic external ID when none exists", async () => {
    const repo = repository();
    vi.mocked(repo.findByExternalId).mockResolvedValue(null);
    vi.mocked(repo.create).mockResolvedValue(84);

    await expect(upsertOdooContact(event, repo)).resolves.toEqual({
      externalId: "nexus.customer_18f17023_3d65_45da_a876_3ff6ca8b74e5",
      operation: "created",
      recordId: "84",
    });
    expect(repo.create).toHaveBeenCalledWith(
      {
        name: "Northwind Buyer Inc",
        email: "buyer@northwind.example",
        phone: false,
      },
      "nexus.customer_18f17023_3d65_45da_a876_3ff6ca8b74e5",
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe("Commerce Nexus callback", () => {
  it("posts the synchronization result with the tenant API key", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({} as never);
    const connection: Connection = {
      key: "nexusApiKey",
      configVarKey: "Nexus Connection",
      fields: {
        callbackUrl: "https://nexus.example.com/webhooks/odoo",
        apiKey: "tenant-api-key",
      },
    };
    const payload: NexusCallbackPayload = {
      event_id: event.event_id,
      entity_type: "customer",
      entity_id: event.entity_id,
      external_id: "84",
      synchronization_result: "success",
      metadata: {
        prismatic_execution_id: "exec-12345",
        odoo_external_id: buildOdooExternalId(event.entity_id),
        odoo_model: "res.partner",
        odoo_operation: "created",
      },
    };

    await postNexusCallback(connection, payload);

    expect(post).toHaveBeenCalledWith("https://nexus.example.com/webhooks/odoo", payload, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "tenant-api-key",
      },
      timeout: 10_000,
    });
  });
});
