export interface NexusEventPayload {
  action?: string;
  event_id?: string;
  event_type?: string;
  tenant_id?: string;
  entity_type?: string;
  entity_id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  sku?: string;
  price?: number | string;
  stock_quantity?: number;
  external_id?: string | null;
  synchronization_result?: string;
}

export interface NexusCallbackPayload {
  event_id: string;
  entity_type: "customer" | "product";
  entity_id: string;
  external_id?: string;
  synchronization_result: "success";
}
