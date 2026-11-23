import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

const ORIGIN = "http://localhost:3000";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard?tab=completed", "/dashboard?tab=completed"],
    ["/auth/update-password#x", "/auth/update-password#x"],
    ["dashboard", "/dashboard"],
  ])("keeps same-origin path %j", (next, expected) => {
    expect(safeRedirectPath(next, ORIGIN)).toBe(expected);
  });

  it.each([
    [null],
    [""],
    ["https://evil.example"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["\t//evil.example"],
    ["javascript:alert(1)"],
    ["http://localhost:3001/dashboard"],
  ])("rejects off-site target %j", (next) => {
    expect(safeRedirectPath(next, ORIGIN)).toBe("/");
  });

  it("never returns a protocol-relative path", () => {
    for (const next of ["/.//evil.example", "/..//evil.example", "/%2e//evil.example"]) {
      const result = safeRedirectPath(next, ORIGIN);
      expect(result.startsWith("//")).toBe(false);
      expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
    }
  });
});
