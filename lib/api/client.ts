import type { ApiErrorBody } from "./types";

/** Error thrown by apiFetch, carrying the API's structured error body. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorBody["error"]["details"],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ApiFetchInit = Omit<RequestInit, "body"> & { json?: unknown };

/** Typed fetch for the app's own API. Same-origin, so auth cookies are sent. */
export async function apiFetch<T>(url: string, { json, headers, ...init }: ApiFetchInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (!response.ok) {
    // The body isn't guaranteed to be our error shape: a proxy, the platform or
    // a crashed route can return HTML or other JSON. Read it defensively.
    const body = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
    const error = body && typeof body.error === "object" ? body.error : undefined;
    throw new ApiRequestError(
      response.status,
      typeof error?.code === "string" ? error.code : "unknown_error",
      typeof error?.message === "string" ? error.message : `Request failed (${response.status})`,
      Array.isArray(error?.details) ? error.details : undefined,
    );
  }
  return (await response.json()) as T;
}
