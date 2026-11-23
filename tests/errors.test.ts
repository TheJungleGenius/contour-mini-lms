import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, fromPostgrestError, toApiError, withErrorHandling } from "@/lib/api/errors";

const pgError = (code: string, message = "db says no") =>
  ({ code, message, details: "", hint: "", name: "PostgrestError" }) as unknown as PostgrestError;

describe("fromPostgrestError", () => {
  it.each([
    ["23514", 422, "validation_error"],
    ["22P02", 422, "validation_error"],
    ["42501", 403, "forbidden"],
  ])("maps %s to %i", (code, status, apiCode) => {
    const err = fromPostgrestError(pgError(code));
    expect(err.status).toBe(status);
    expect(err.code).toBe(apiCode);
  });

  it("hides unknown database errors behind a generic 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = fromPostgrestError(pgError("XX000", "relation secret_table does not exist"));
    expect(err.status).toBe(500);
    expect(err.message).not.toContain("secret_table");
  });
});

describe("withErrorHandling", () => {
  it("serialises ZodErrors as 422 with field details", async () => {
    const handler = withErrorHandling(async () => {
      z.object({ reason: z.string().min(1) }).parse({ reason: "" });
      return new Response();
    });
    const res = await handler();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.details[0].path).toBe("reason");
  });

  it("passes ApiErrors through", async () => {
    const res = await withErrorHandling(async () => {
      throw new ApiError(404, "not_found", "Consultation not found");
    })();
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("Consultation not found");
  });

  it("turns unexpected errors into a 500 without leaking details", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = toApiError(new Error("stack trace with secrets"));
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong");
  });
});
