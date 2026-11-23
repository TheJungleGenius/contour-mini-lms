import { z } from "zod";
import { personName } from "@/lib/profiles/validation";
import { CONSULTATION_STATUSES } from "./types";

// Single source of truth for input rules, used by both route handlers and forms.
// Limits match the CHECK constraints in the migrations.
export const REASON_MAX = 1000;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
// Booking limits; must match the consultations_enforce_rules trigger.
export const BOOKING_HORIZON_DAYS = 365;
export const MAX_UPCOMING_CONSULTATIONS = 10; // enforced in the DB only (needs a count)

const DAY_MS = 86_400_000;

const reason = z
  .string()
  .trim()
  .min(1, "Reason is required")
  .max(REASON_MAX, `Reason must be at most ${REASON_MAX} characters`);

const isFuture = (value: string) => {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t > Date.now();
};

const isWithinHorizon = (value: string) =>
  new Date(value).getTime() <= Date.now() + BOOKING_HORIZON_DAYS * DAY_MS;

const HORIZON_MESSAGE = `Must be within ${BOOKING_HORIZON_DAYS} days`;

/** Latest bookable moment, e.g. for an input's `max`. */
export const bookingHorizon = () => new Date(Date.now() + BOOKING_HORIZON_DAYS * DAY_MS);

// API: an ISO 8601 timestamp with an explicit offset (no ambiguous local times).
const futureIsoDateTime = z
  .iso.datetime({ offset: true, error: "Must be an ISO 8601 date-time with a timezone" })
  .refine(isFuture, "Must be in the future")
  .refine(isWithinHorizon, HORIZON_MESSAGE);

export const consultationStatusSchema = z.enum(CONSULTATION_STATUSES);

// ---------------------------------------------------------------------------
// API schemas
// ---------------------------------------------------------------------------
export const createConsultationSchema = z.strictObject({
  firstName: personName("First name"),
  lastName: personName("Last name"),
  reason,
  scheduledAt: futureIsoDateTime,
});
export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;

// PATCH carries exactly one intent: a status change, or a reschedule.
export const updateConsultationSchema = z.union([
  z.strictObject({ status: consultationStatusSchema }),
  z.strictObject({ scheduledAt: futureIsoDateTime }),
]);
export type UpdateConsultationInput = z.infer<typeof updateConsultationSchema>;

export const listConsultationsQuerySchema = z.object({
  status: consultationStatusSchema.optional(),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type ListConsultationsQuery = z.infer<typeof listConsultationsQuerySchema>;

export const consultationIdSchema = z.uuid({ error: "Invalid consultation id" });

// ---------------------------------------------------------------------------
// Form schemas (client): <input type="datetime-local"> yields a local time with
// no offset, e.g. "2026-11-23T14:30". It's converted to ISO before sending.
// ---------------------------------------------------------------------------
const futureLocalDateTime = z
  .string()
  .min(1, "Choose a date and time")
  .refine(isFuture, "Must be in the future")
  .refine(isWithinHorizon, HORIZON_MESSAGE);

export const bookingFormSchema = z.object({
  firstName: personName("First name"),
  lastName: personName("Last name"),
  reason,
  scheduledAt: futureLocalDateTime,
});
export type BookingFormValues = z.infer<typeof bookingFormSchema>;

export const rescheduleFormSchema = z.object({
  scheduledAt: futureLocalDateTime,
});
export type RescheduleFormValues = z.infer<typeof rescheduleFormSchema>;

/** "2026-11-23T14:30" (browser local time) -> "2026-11-23T03:30:00.000Z" */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** ISO -> "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
export function isoToLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
