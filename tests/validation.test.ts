import { describe, expect, it } from "vitest";
import {
  createConsultationSchema,
  listConsultationsQuerySchema,
  updateConsultationSchema,
} from "@/lib/consultations/validation";

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

const validCreate = () => ({
  firstName: "Sam",
  lastName: "Student",
  reason: "Help with calculus",
  scheduledAt: future(),
});

describe("createConsultationSchema", () => {
  it("accepts a valid booking and trims strings", () => {
    const parsed = createConsultationSchema.parse({ ...validCreate(), firstName: "  Sam " });
    expect(parsed.firstName).toBe("Sam");
  });

  it("rejects past times", () => {
    expect(createConsultationSchema.safeParse({ ...validCreate(), scheduledAt: past() }).success).toBe(false);
  });

  it("rejects timestamps without a timezone", () => {
    expect(
      createConsultationSchema.safeParse({ ...validCreate(), scheduledAt: "2099-01-01T10:00" }).success,
    ).toBe(false);
  });

  it("enforces the booking horizon", () => {
    const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
    expect(createConsultationSchema.safeParse({ ...validCreate(), scheduledAt: daysAhead(364) }).success).toBe(true);
    expect(createConsultationSchema.safeParse({ ...validCreate(), scheduledAt: daysAhead(366) }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ scheduledAt: daysAhead(366) }).success).toBe(false);
  });

  it("rejects blank and over-long fields", () => {
    expect(createConsultationSchema.safeParse({ ...validCreate(), reason: "   " }).success).toBe(false);
    expect(createConsultationSchema.safeParse({ ...validCreate(), lastName: "x".repeat(101) }).success).toBe(false);
    expect(createConsultationSchema.safeParse({ ...validCreate(), reason: "x".repeat(1001) }).success).toBe(false);
  });

  it("rejects unknown fields such as student_id or status (mass assignment)", () => {
    expect(createConsultationSchema.safeParse({ ...validCreate(), studentId: crypto.randomUUID() }).success).toBe(false);
    expect(createConsultationSchema.safeParse({ ...validCreate(), status: "completed" }).success).toBe(false);
  });
});

describe("updateConsultationSchema", () => {
  it("accepts exactly one intent", () => {
    expect(updateConsultationSchema.safeParse({ status: "completed" }).success).toBe(true);
    expect(updateConsultationSchema.safeParse({ status: "cancelled" }).success).toBe(true);
    expect(updateConsultationSchema.safeParse({ scheduledAt: future() }).success).toBe(true);
  });

  it("rejects combined, empty, or unknown payloads", () => {
    expect(updateConsultationSchema.safeParse({ status: "completed", scheduledAt: future() }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({}).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ reason: "edited" }).success).toBe(false);
  });
});

describe("listConsultationsQuerySchema", () => {
  it("applies defaults and coerces limit", () => {
    expect(listConsultationsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listConsultationsQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("bounds limit", () => {
    expect(listConsultationsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listConsultationsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
