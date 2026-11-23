import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorBody["error"]["details"],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthenticated = () =>
  new ApiError(401, "unauthenticated", "Authentication required");
export const forbidden = () =>
  new ApiError(403, "forbidden", "You do not have permission to perform this action");
export const notFound = (what = "Resource") =>
  new ApiError(404, "not_found", `${what} not found`);

/**
 * Maps generic Postgres/PostgREST errors to API errors. Domain-specific codes
 * (custom SQLSTATEs, which unique index means what) belong to the domain's own
 * mapper, which falls back to this one; see lib/consultations/errors.ts.
 */
export function fromPostgrestError(error: PostgrestError): ApiError {
  switch (error.code) {
    case "23514": // check_violation
    case "22P02": // invalid_text_representation (e.g. bad enum/uuid)
      return new ApiError(422, "validation_error", "Invalid input");
    case "42501": // insufficient_privilege / RLS violation
      return forbidden();
    default:
      // Never leak internal error details to the client.
      console.error("Unhandled database error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return new ApiError(500, "internal_error", "Something went wrong");
  }
}

export function errorResponse(err: ApiError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    },
    { status: err.status },
  );
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    return new ApiError(
      422,
      "validation_error",
      "Request validation failed",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  console.error("Unhandled API error", err);
  return new ApiError(500, "internal_error", "Something went wrong");
}

/** Wraps a route handler so every failure comes back in the same error shape. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      // Let Next.js's own control-flow errors through (e.g. cookies() bailing
      // out of prerendering at build time); only map application errors.
      unstable_rethrow(err);
      return errorResponse(toApiError(err));
    }
  };
}
