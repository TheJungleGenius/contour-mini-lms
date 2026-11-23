import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  keysetFilter,
  toPage,
} from "@/lib/consultations/cursor";

const id = "aaaaaaaa-1111-4000-a000-000000000001";
const ts = "2026-11-23T10:00:00+00:00";

describe("cursor encoding", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor({ scheduled_at: ts, id }))).toEqual({ scheduledAt: ts, id });
  });

  it("rejects garbage and filter-injection attempts", () => {
    const evil = Buffer.from(JSON.stringify([ts, `${id}),status.eq.cancelled`])).toString("base64url");
    for (const bad of ["not-base64!", "", evil, Buffer.from("[1,2]").toString("base64url")]) {
      expect(() => decodeCursor(bad)).toThrow(InvalidCursorError);
    }
  });
});

describe("keysetFilter", () => {
  it("builds a quoted PostgREST filter for each direction", () => {
    expect(keysetFilter({ scheduledAt: ts, id }, "asc")).toBe(
      `scheduled_at.gt."${ts}",and(scheduled_at.eq."${ts}",id.gt.${id})`,
    );
    expect(keysetFilter({ scheduledAt: ts, id }, "desc")).toContain("scheduled_at.lt.");
  });
});

describe("toPage", () => {
  const rows = [1, 2, 3].map((n) => ({
    id: `aaaaaaaa-1111-4000-a000-00000000000${n}`,
    scheduled_at: `2026-11-2${n}T10:00:00+00:00`,
  }));

  it("returns a next cursor when there are more rows than the limit", () => {
    const page = toPage(rows, 2, (r) => r.id);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor!).id).toBe(rows[1].id);
  });

  it("returns no cursor on the last page", () => {
    expect(toPage(rows, 3, (r) => r.id).nextCursor).toBeNull();
  });
});
