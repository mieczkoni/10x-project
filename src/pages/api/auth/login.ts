import type { APIRoute } from "astro";

import { ApiErrors, jsonError, jsonOk } from "../../../lib/http/api-response";
import { loginSchema } from "../../../lib/validation/auth.zod";
import { createSupabaseServerInstance } from "../../../db/supabase.server";
import { createEvent } from "../../../lib/services/events.service";
import { checkLoginRateLimit, recordLoginFailure, resetLoginFailures } from "../../../lib/services/login-rate-limit";
import type { UserId } from "../../../types";

export const prerender = false;

const RATE_LIMIT_MESSAGE = "Too many attempts. Please try again in a few minutes.";
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput("Invalid JSON in request body");
    }
    return ApiErrors.invalidInput("Invalid request body");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return ApiErrors.invalidInput("Invalid request body", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, password } = parsed.data;
  const ipAddress = getClientIp(request);
  const limiter = checkLoginRateLimit(email, ipAddress);

  if (!limiter.allowed) {
    return jsonError(429, "rate_limited", RATE_LIMIT_MESSAGE, {
      retryAfterSeconds: limiter.retryAfterSeconds,
    });
  }

  const supabase = createSupabaseServerInstance({
    cookies,
    headers: request.headers,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    recordLoginFailure(limiter.key);

    if (error?.status === 429) {
      return ApiErrors.rateLimited(RATE_LIMIT_MESSAGE);
    }

    return jsonError(401, "invalid_credentials", INVALID_CREDENTIALS_MESSAGE);
  }

  resetLoginFailures(limiter.key);

  void createEvent(supabase, data.user.id as UserId, "login", {
    source: "email_password",
  });

  return jsonOk({
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
};
