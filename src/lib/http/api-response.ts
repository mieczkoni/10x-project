/**
 * Consistent JSON response helpers for REST API endpoints.
 * 
 * These utilities ensure all API responses follow a uniform structure
 * and use appropriate HTTP status codes per the API plan.
 */

import type { ApiErrorResponseDto, JsonObject } from '../../types';

/**
 * Creates a successful JSON response with the specified data and status code.
 * 
 * @param data - The response payload
 * @param status - HTTP status code (default: 200)
 * @returns Astro Response object with JSON content
 */
export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Creates an error JSON response with the ApiErrorResponseDto structure.
 * 
 * @param status - HTTP status code (e.g., 400, 401, 404, 500)
 * @param code - Machine-readable error code
 * @param message - User-friendly error message
 * @param details - Optional additional context (must be safe to expose)
 * @returns Astro Response object with error JSON
 * 
 * @example
 * ```ts
 * return jsonError(404, 'not_found', 'Deck not found');
 * ```
 */
export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: JsonObject
): Response {
  const body: ApiErrorResponseDto = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Creates a 204 No Content response (for successful DELETE operations).
 * 
 * @returns Astro Response with no body
 */
export function noContent(): Response {
  return new Response(null, {
    status: 204,
  });
}

/**
 * Standard error response creators for common scenarios.
 */
export const ApiErrors = {
  /**
   * 400 Bad Request - Invalid input from client.
   */
  invalidInput: (message: string, details?: JsonObject) =>
    jsonError(400, 'invalid_input', message, details),

  /**
   * 401 Unauthorized - Missing or invalid authentication.
   */
  unauthorized: (message = 'Authentication required') =>
    jsonError(401, 'unauthorized', message),

  /**
   * 404 Not Found - Resource doesn't exist (or not owned by user).
   */
  notFound: (message = 'Resource not found') =>
    jsonError(404, 'not_found', message),

  /**
   * 500 Internal Server Error - Unexpected server failure.
   */
  serverError: (message = 'An unexpected error occurred', details?: JsonObject) =>
    jsonError(500, 'server_error', message, details),
};
