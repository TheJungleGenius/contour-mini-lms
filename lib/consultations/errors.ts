import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError, fromPostgrestError } from "@/lib/api/errors";

/**
 * Maps database errors raised by consultation writes to API errors. The custom
 * SQLSTATEs come from the consultations_enforce_rules trigger, and 23505 from
 * consultations_one_per_slot_idx (see supabase/migrations). Anything else is
 * handled by the generic mapper.
 */
export function consultationDbError(error: PostgrestError): ApiError {
  switch (error.code) {
    case "CN001": // invalid state transition
      return new ApiError(409, "invalid_transition", error.message);
    case "CN002": // scheduled_at outside the bookable window
      return new ApiError(422, "validation_error", error.message);
    case "CN003": // too many upcoming consultations
      return new ApiError(409, "limit_reached", error.message);
    case "23505": // unique_violation: consultations_one_per_slot_idx
      return new ApiError(409, "slot_taken", "You already have a consultation booked at that time");
    default:
      return fromPostgrestError(error);
  }
}
