import { parseCustomerEvent } from "./customer";

describe("parseCustomerEvent", () => {
  it("accepts a valid Commerce Nexus customer event", () => {
    const event = {
      event_id: "event-123",
      entity_id: "customer-123",
      payload: {
        id: "customer-123",
        name: "Ada Buyer",
        email: "ada@example.com",
        phone: null,
        external_id: "25",
      },
    };

    expect(parseCustomerEvent(event)).toEqual(event);
  });

  it("rejects a missing payload", () => {
    expect(() =>
      parseCustomerEvent({ event_id: "event-123", entity_id: "customer-123" }),
    ).toThrow("body.data.payload must be an object");
  });

  it("rejects invalid customer field types", () => {
    expect(() =>
      parseCustomerEvent({
        event_id: "event-123",
        entity_id: "customer-123",
        payload: {
          id: "customer-123",
          name: "Ada Buyer",
          email: "ada@example.com",
          phone: 123,
        },
      }),
    ).toThrow("payload.phone must be a string or null");
  });
});
