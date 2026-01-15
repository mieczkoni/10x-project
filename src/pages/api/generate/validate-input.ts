import type { APIRoute } from 'astro';
import { ZodError } from 'zod';

import { ApiErrors, jsonOk } from '../../../lib/http/api-response';
import {
  generateValidationLimits,
  validateGenerateInputSchema,
} from '../../../lib/validation/generate.zod';

export const prerender = false;

/**
 * POST /api/generate/validate-input
 *
 * Lightweight validation endpoint to check input size before invoking the
 * generation provider. It intentionally avoids any provider calls or DB
 * writes to keep this path inexpensive.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const {
    data: { user },
    error: authError,
  } = await locals.supabase.auth.getUser();

  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiErrors.invalidInput('Invalid JSON in request body');
  }

  try {
    const validated = validateGenerateInputSchema.parse(body);
    const inputChars = validated.source_text.length;

    if (inputChars > generateValidationLimits.MAX_SOURCE_TEXT_CHARS) {
      return ApiErrors.inputTooLarge('source_text exceeds maximum allowed length', {
        input_chars: inputChars,
        max_chars: generateValidationLimits.MAX_SOURCE_TEXT_CHARS,
      });
    }

    return jsonOk({
      ok: true,
      input_chars: inputChars,
      max_chars: generateValidationLimits.MAX_SOURCE_TEXT_CHARS,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const tooLarge = error.errors.some((issue) => issue.code === 'too_big');
      if (tooLarge) {
        return ApiErrors.inputTooLarge('source_text exceeds maximum allowed length');
      }

      return ApiErrors.invalidInput('Invalid request body', {
        issues: JSON.parse(JSON.stringify(error.errors)),
      });
    }

    return ApiErrors.serverError();
  }
};
