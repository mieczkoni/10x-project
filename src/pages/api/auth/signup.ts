import type { APIRoute } from "astro";

import { ApiErrors, jsonError, jsonOk } from "../../../lib/http/api-response";
import { signupSchema } from "../../../lib/validation/auth.zod";
import { createSupabaseServerInstance } from "../../../db/supabase.server";
import { createEvent } from "../../../lib/services/events.service";
import type { UserId } from "../../../types";

export const prerender = false;

const ACCOUNT_EXISTS_MESSAGE = "Account already exists. Log in instead.";

function isAccountExistsError(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  const message = errorMessage.toLowerCase();
  return message.includes("already registered") || message.includes("user already");
}

function isWeakPasswordError(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  const message = errorMessage.toLowerCase();
  return message.includes("password") && (message.includes("weak") || message.includes("policy"));
}

function isEmailNotAllowedError(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  const message = errorMessage.toLowerCase();
  return message.includes("email") && (message.includes("not allowed") || message.includes("invalid"));
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

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return ApiErrors.invalidInput("Invalid request body", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, password } = parsed.data;

  const supabase = createSupabaseServerInstance({
    cookies,
    headers: request.headers,
  });

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error || !data.user) {
    if (error?.status === 429) {
      return ApiErrors.rateLimited("Too many attempts. Please try again in a few minutes.");
    }
    if (isAccountExistsError(error?.message)) {
      return jsonError(409, "account_exists", ACCOUNT_EXISTS_MESSAGE);
    }
    if (isWeakPasswordError(error?.message)) {
      return jsonError(400, "weak_password", "Password doesn't meet the requirements.");
    }
    if (isEmailNotAllowedError(error?.message)) {
      return jsonError(400, "email_not_allowed", "Unable to create account with this email.");
    }

    return ApiErrors.serverError("Failed to create account");
  }

  void createEvent(supabase, data.user.id as UserId, "signup", {
    source: "email_password",
  });

  return jsonOk({
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
};
