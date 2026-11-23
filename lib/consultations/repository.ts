import "server-only";
import { ApiError, notFound } from "@/lib/api/errors";
import type { Page } from "@/lib/api/types";
import type { Database } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { decodeCursor, InvalidCursorError, keysetFilter, toPage } from "./cursor";
import { consultationDbError } from "./errors";
import type { AdminConsultation, Consultation } from "./types";
import type {
  CreateConsultationInput,
  ListConsultationsQuery,
  UpdateConsultationInput,
} from "./validation";

/**
 * Data access for consultations: the only module that knows the table's shape.
 * It takes the *request-scoped* Supabase client (the user's JWT), so every
 * query also passes through RLS, and returns camelCase domain objects.
 *
 * Queries still filter by student_id explicitly: this documents intent, helps
 * the planner use the (student_id, scheduled_at, id) index, and doesn't rely on
 * RLS alone for "my consultations" semantics.
 */

type ConsultationRow = Database["public"]["Tables"]["consultations"]["Row"];
type ConsultationListRow = Omit<ConsultationRow, "student_id">;

/** Columns behind a Consultation DTO. student_id stays server-side. */
const CONSULTATION_COLUMNS =
  "id, first_name, last_name, reason, scheduled_at, status, completed_at, cancelled_at, created_at, updated_at";

// `as const` keeps the literal type, which supabase-js parses to type the rows.
const ADMIN_CONSULTATION_COLUMNS =
  `${CONSULTATION_COLUMNS}, student:profiles(id, email, first_name, last_name)` as const;

function toConsultation(row: ConsultationListRow): Consultation {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    reason: row.reason,
    scheduledAt: row.scheduled_at,
    status: row.status,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applyCursor(cursor: string | undefined, direction: "asc" | "desc") {
  if (!cursor) return null;
  try {
    return keysetFilter(decodeCursor(cursor), direction);
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw new ApiError(400, "invalid_cursor", "Invalid pagination cursor");
    }
    throw err;
  }
}

/** A student's own consultations, soonest first. */
export async function listStudentConsultations(
  supabase: TypedSupabaseClient,
  studentId: string,
  { status, cursor, limit }: ListConsultationsQuery,
): Promise<Page<Consultation>> {
  let query = supabase
    .from("consultations")
    .select(CONSULTATION_COLUMNS)
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (status) query = query.eq("status", status);
  const after = applyCursor(cursor, "asc");
  if (after) query = query.or(after);

  const { data, error } = await query;
  if (error) throw consultationDbError(error);
  return toPage(data, limit, toConsultation);
}

/** Every consultation in the system, latest first, with the booking student. */
export async function listAllConsultations(
  supabase: TypedSupabaseClient,
  { status, cursor, limit }: ListConsultationsQuery,
): Promise<Page<AdminConsultation>> {
  let query = supabase
    .from("consultations")
    .select(ADMIN_CONSULTATION_COLUMNS)
    .order("scheduled_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status) query = query.eq("status", status);
  const after = applyCursor(cursor, "desc");
  if (after) query = query.or(after);

  const { data, error } = await query;
  if (error) throw consultationDbError(error);

  return toPage(data, limit, ({ student, ...row }) => ({
    ...toConsultation(row),
    student: student
      ? {
          id: student.id,
          email: student.email,
          firstName: student.first_name,
          lastName: student.last_name,
        }
      : null,
  }));
}

export async function createConsultation(
  supabase: TypedSupabaseClient,
  input: CreateConsultationInput,
): Promise<Consultation> {
  // student_id is not sent: the column default (auth.uid()) sets it, and the
  // INSERT grant doesn't even include it.
  const { data, error } = await supabase
    .from("consultations")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      reason: input.reason,
      scheduled_at: input.scheduledAt,
    })
    .select(CONSULTATION_COLUMNS)
    .single();

  if (error) throw consultationDbError(error);
  return toConsultation(data);
}

export async function updateConsultation(
  supabase: TypedSupabaseClient,
  studentId: string,
  id: string,
  input: UpdateConsultationInput,
): Promise<Consultation> {
  const patch =
    "status" in input ? { status: input.status } : { scheduled_at: input.scheduledAt };

  const { data, error } = await supabase
    .from("consultations")
    .update(patch)
    .eq("id", id)
    .eq("student_id", studentId)
    .select(CONSULTATION_COLUMNS)
    .maybeSingle();

  if (error) throw consultationDbError(error);
  // "Doesn't exist" and "not yours" look the same, so ids can't be probed.
  if (!data) throw notFound("Consultation");
  return toConsultation(data);
}
