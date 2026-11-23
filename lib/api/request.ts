import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError } from "./errors";

/**
 * Largest JSON body the API accepts. The biggest legitimate request (a booking
 * with a 1000-character reason) is well under 8 KB; the cap stops oversized
 * bodies from being buffered into memory before validation even runs.
 */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

const payloadTooLarge = () =>
  new ApiError(413, "payload_too_large", `Request body must be at most ${MAX_JSON_BODY_BYTES} bytes`);

/** Reads the body as text, aborting as soon as it exceeds the cap. */
async function readBodyCapped(request: NextRequest): Promise<string> {
  // Cheap early exit when the client declares the size up front...
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_JSON_BODY_BYTES) throw payloadTooLarge();

  // ...but don't trust it: count the bytes actually received.
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Parses and validates a JSON body. Requiring `application/json` is a cheap
 * CSRF hardening layer on top of SameSite=Lax cookies: a cross-site HTML form
 * can't send that content type without a CORS preflight.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json");
  }

  const text = await readBodyCapped(request);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseSearchParams<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): z.infer<S> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}
