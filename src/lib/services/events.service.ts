import type { SupabaseClient } from "../../db/supabase.client";
import type { EventType, JsonObject, UserId } from "../../types";
import { logger } from "../logger";

/**
 * Writes a telemetry event. Failures are intentionally swallowed to avoid
 * impacting user-facing flows; errors are logged for observability.
 */
export async function createEvent(
  supabase: SupabaseClient,
  userId: UserId,
  eventType: EventType,
  payload: JsonObject = {}
): Promise<void> {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    event_type: eventType,
    payload,
  });

  if (error) {
    logger.error("[events.service] Failed to create event", {
      eventType,
      userId,
      error: error.message,
    });
  }
}
