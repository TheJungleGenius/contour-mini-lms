import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiRequestError } from "@/lib/api/client";

function respondWith(status: number, body: string, contentType = "application/json") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, headers: { "Content-Type": contentType } })),
  );
}

async function failure(): Promise<ApiRequestError> {
  try {
    await apiFetch("/api/anything");
  } catch (err) {
    return err as ApiRequestError;
  }
  throw new Error("expected apiFetch to throw");
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch errors", () => {
  it("reads the API's error shape", async () => {
    respondWith(
      422,
      JSON.stringify({
        error: { code: "validation_error", message: "Bad", details: [{ path: "reason", message: "Required" }] },
      }),
    );
    const err = await failure();
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.details).toEqual([{ path: "reason", message: "Required" }]);
  });

  it.each([
    ["JSON without an error key", JSON.stringify({ message: "Bad gateway" }), "application/json"],
    ["an error that isn't an object", JSON.stringify({ error: "nope" }), "application/json"],
    ["an HTML error page", "<html>502</html>", "text/html"],
  ])("falls back to a generic ApiRequestError for %s", async (_label, body, contentType) => {
    respondWith(502, body, contentType);
    const err = await failure();
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe("unknown_error");
    expect(err.message).toBe("Request failed (502)");
    expect(err.details).toBeUndefined();
  });
});
