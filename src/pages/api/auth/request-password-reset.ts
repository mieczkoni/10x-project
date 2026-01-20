import type { APIRoute } from 'astro';

import { ApiErrors, jsonOk } from '../../../lib/http/api-response';
import { requestPasswordResetSchema } from '../../../lib/validation/auth.zod';
import { createSupabaseServerInstance } from '../../../db/supabase.server';

export const prerender = false;

function getRequestOrigin(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput('Invalid JSON in request body');
    }
    return ApiErrors.invalidInput('Invalid request body');
  }

  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return ApiErrors.invalidInput('Invalid request body', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { email } = parsed.data;
  const origin = getRequestOrigin(request);

  const supabase = createSupabaseServerInstance({
    cookies,
    headers: request.headers,
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error?.status === 429) {
    return ApiErrors.rateLimited('Too many requests. Please try again in a few minutes.');
  }

  if (error) {
    console.error('[POST /api/auth/request-password-reset] Failed to send reset email', {
      message: error.message,
      status: error.status,
    });
  }

  return jsonOk({ ok: true });
};
