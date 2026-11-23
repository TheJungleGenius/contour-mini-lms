import { z } from "zod";

/**
 * Keyset (cursor) pagination over (scheduled_at, id). Unlike OFFSET, cost
 * doesn't grow with page depth, and rows inserted between page loads don't
 * cause duplicates or gaps. The cursor is opaque to clients (base64url JSON).
 *
 * Decoded cursors are strictly validated before they're interpolated into a
 * PostgREST filter, so a crafted cursor can't inject extra filter syntax.
 */

const cursorSchema = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);

export type Cursor = { scheduledAt: string; id: string };

export function encodeCursor(row: { scheduled_at: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.scheduled_at, row.id])).toString("base64url");
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const [scheduledAt, id] = cursorSchema.parse(raw);
    return { scheduledAt, id };
  } catch {
    throw new InvalidCursorError();
  }
}

/** PostgREST `or` filter selecting rows strictly after the cursor in sort order. */
export function keysetFilter(cursor: Cursor, direction: "asc" | "desc"): string {
  const op = direction === "asc" ? "gt" : "lt";
  // Quoted because ISO timestamps contain reserved characters (: . +).
  const ts = `"${cursor.scheduledAt}"`;
  return `scheduled_at.${op}.${ts},and(scheduled_at.eq.${ts},id.${op}.${cursor.id})`;
}

/** Fetch `limit + 1` rows; the extra row signals that another page exists. */
export function toPage<Row extends { scheduled_at: string; id: string }, T>(
  rows: Row[],
  limit: number,
  map: (row: Row) => T,
) {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(map),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
