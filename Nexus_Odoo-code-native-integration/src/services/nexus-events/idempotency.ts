import { Redis } from "@upstash/redis";
import type { FlowExecutionContext } from "@prismatic-io/spectral";
import type { NexusEventPayload } from "../nexus/types";

const PROCESSING_TTL_SECONDS = 2 * 60;
const COMPLETED_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface DuplicateProductEventResult {
  ignored: true;
  duplicate: true;
  eventId: string;
}

interface RedisConnectionValue {
  fields: Record<string, unknown>;
}

function requiredEventIdentity(payload: NexusEventPayload) {
  const tenantId = String(payload.tenant_id || "").trim();
  const eventId = String(payload.event_id || "").trim();

  if (!tenantId || !eventId) {
    throw new Error(
      "Product idempotency requires both tenant_id and event_id before Odoo can be called",
    );
  }

  return { tenantId, eventId };
}

function redisClient(context: FlowExecutionContext) {
  const connection = context.configVars["Upstash Redis"] as
    RedisConnectionValue | undefined;
  const restUrl = String(connection?.fields.restUrl || "").trim();
  const restToken = String(connection?.fields.restToken || "").trim();

  if (!restUrl || !restToken) {
    throw new Error(
      "The Upstash Redis connection must include a REST URL and REST token before product events can be processed",
    );
  }

  return new Redis({ url: restUrl, token: restToken });
}

export async function withProductEventIdempotency<T>(
  context: FlowExecutionContext,
  payload: NexusEventPayload,
  handler: () => Promise<T>,
): Promise<T | DuplicateProductEventResult> {
  const { tenantId, eventId } = requiredEventIdentity(payload);
  const redis = redisClient(context);
  const key = `nexus-odoo:product:${tenantId}:${eventId}`;

  let claimed: string | null;
  try {
    claimed = await redis.set(key, "processing", {
      nx: true,
      ex: PROCESSING_TTL_SECONDS,
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown Redis error";
    context.logger.error("Unable to claim the product event in Redis", {
      tenantId,
      eventId,
      reason,
    });
    throw new Error(
      `Redis idempotency claim failed for product event ${eventId}`,
    );
  }

  if (claimed === null) {
    context.logger.info("Ignored duplicate Nexus product event", {
      tenantId,
      eventId,
    });
    return { ignored: true, duplicate: true, eventId };
  }

  try {
    const result = await handler();
    await redis.set(key, "completed", { ex: COMPLETED_TTL_SECONDS });
    context.logger.info("Completed Nexus product event idempotently", {
      tenantId,
      eventId,
    });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    context.logger.error(
      "Product event failed; the Redis processing lock will expire for retry",
      { tenantId, eventId, reason },
    );
    throw error;
  }
}
