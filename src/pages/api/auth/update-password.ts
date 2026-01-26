import type { APIRoute } from "astro";

import { ApiErrors, jsonError, jsonOk } from "../../../lib/http/api-response";
import { updatePasswordSchema } from "../../../lib/validation/auth.zod";
import { createSupabaseServerInstance } from "../../../db/supabase.server";

export const prerender = false;

const INVALID_RECOVERY_MESSAGE = "This password reset link is invalid or has expired. Please request a new one.";

function isWeakPasswordError(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  const message = errorMessage.toLowerCase();
  return message.includes("password") && (message.includes("weak") || message.includes("policy"));
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

  const parsed = updatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return ApiErrors.invalidInput("Invalid request body", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { password, accessToken, refreshToken, code } = parsed.data;

  const supabase = createSupabaseServerInstance({
    cookies,
    headers: request.headers,
  });

  if (code && typeof supabase.auth.exchangeCodeForSession === "function") {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.session) {
      return jsonError(400, "recovery_invalid", INVALID_RECOVERY_MESSAGE);
    }
  }

  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      return jsonError(400, "recovery_invalid", INVALID_RECOVERY_MESSAGE);
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data?.session) {
      return jsonError(400, "recovery_invalid", INVALID_RECOVERY_MESSAGE);
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return ApiErrors.unauthorized("Authentication required");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.status === 429) {
      return ApiErrors.rateLimited("Too many requests. Please try again in a few minutes.");
    }
    if (isWeakPasswordError(error.message)) {
      return jsonError(400, "weak_password", "Password doesn't meet the requirements.");
    }
    return ApiErrors.serverError("Failed to update password");
  }

  return jsonOk({ ok: true });
};
