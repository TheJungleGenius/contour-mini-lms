import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fromPostgrestError } from "@/lib/api/errors";
import { consultationDbError } from "@/lib/consultations/errors";

const pgError = (code: string, message = "db says no") =>
  ({ code, message, details: "", hint: "", name: "PostgrestError" }) as unknown as PostgrestError;

describe("consultationDbError", () => {
  it.each([
    ["CN001", 409, "invalid_transition"],
    ["CN002", 422, "validation_error"],
    ["CN003", 409, "limit_reached"],
    ["23505", 409, "slot_taken"],
  ])("maps %s to %i", (code, status, apiCode) => {
    const err = consultationDbError(pgError(code));
    expect(err.status).toBe(status);
    expect(err.code).toBe(apiCode);
  });

  it("falls back to the generic mapper for other codes", () => {
    expect(consultationDbError(pgError("42501")).status).toBe(403);
    expect(consultationDbError(pgError("23514")).status).toBe(422);
  });

  it("keeps consultation codes out of the generic mapper", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fromPostgrestError(pgError("CN001")).status).toBe(500);
  });
});
