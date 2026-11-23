import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { MAX_JSON_BODY_BYTES, parseJsonBody } from "@/lib/api/request";

const schema = z.strictObject({ reason: z.string() });

function post(body: BodyInit, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new NextRequest("http://localhost/api/test", { method: "POST", headers, body });
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("expected a rejection");
}

describe("parseJsonBody", () => {
  it("parses a valid JSON body", async () => {
    await expect(parseJsonBody(post(JSON.stringify({ reason: "ok" })), schema)).resolves.toEqual({ reason: "ok" });
  });

  it("requires application/json (CSRF hardening)", async () => {
    const err = await rejection(parseJsonBody(post("reason=x", { "Content-Type": "text/plain" }), schema));
    expect(err.status).toBe(415);
  });

  it("rejects malformed JSON with 400", async () => {
    const err = await rejection(parseJsonBody(post("{not json"), schema));
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_json");
  });

  it("rejects bodies over the size cap with 413", async () => {
    const big = JSON.stringify({ reason: "x".repeat(MAX_JSON_BODY_BYTES) });
    const err = await rejection(parseJsonBody(post(big), schema));
    expect(err.status).toBe(413);
  });

  it("counts real bytes, not the declared Content-Length", async () => {
    const big = JSON.stringify({ reason: "x".repeat(MAX_JSON_BODY_BYTES) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const request = new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "10" },
      body: stream,
      duplex: "half", // required by Node's fetch for streamed bodies
    });
    const err = await rejection(parseJsonBody(request, schema));
    expect(err.status).toBe(413);
  });
});
