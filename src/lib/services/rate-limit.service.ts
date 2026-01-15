import type { SupabaseClient } from "../../db/supabase.client";

export const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_REQUESTS = 10;

const requestsByUser = new Map<string, number[]>();

export class RateLimitError extends Error {
  constructor(message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Best-effort in-memory sliding window limiter.
 * Not persistent across server restarts; acceptable for MVP.
 */
export function enforceRateLimit(userId: string, nowMs = Date.now()): void {
  const windowStart = nowMs - WINDOW_MS;
  const timestamps = requestsByUser.get(userId) ?? [];
  const recent = timestamps.filter((ts) => ts >= windowStart);

  if (recent.length >= MAX_REQUESTS) {
    throw new RateLimitError();
  }

  recent.push(nowMs);
  requestsByUser.set(userId, recent);
}

export async function enforceRateLimitDb(
  supabase: SupabaseClient,
  userId: string,
  nowMs = Date.now()
): Promise<void> {
  const windowStartIso = new Date(nowMs - WINDOW_MS).toISOString();
  try {
    const { count, error } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "generate_request")
      .gte("created_at", windowStartIso);

    if (error) {
      console.error("[rate-limit] DB fallback query failed", error.message);
      return;
    }

    const recentCount = count ?? 0;
    if (recentCount >= MAX_REQUESTS) {
      throw new RateLimitError();
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("[rate-limit] DB fallback exception", error);
  }
}
