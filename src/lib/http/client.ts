import type { ApiErrorResponseDto, JsonObject } from "../../types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: JsonObject;

  constructor(status: number, payload: ApiErrorResponseDto) {
    super(payload.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.error.code;
    this.details = payload.error.details;
  }
}

async function readJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 204) {
    return null as T;
  }

  const payload = (await readJsonSafe(response)) as ApiErrorResponseDto | T | null;

  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload) {
      throw new ApiError(response.status, payload as ApiErrorResponseDto);
    }

    throw new ApiError(response.status, {
      error: {
        code: "unknown_error",
        message: response.statusText || "Request failed",
      },
    });
  }

  return (payload ?? null) as T;
}
