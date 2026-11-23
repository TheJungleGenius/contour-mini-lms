import { NextResponse, type NextRequest } from "next/server";
import { notFound, withErrorHandling } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/request";
import { requireApiUser } from "@/lib/auth/guards";
import { updateConsultation } from "@/lib/consultations/repository";
import {
  consultationIdSchema,
  updateConsultationSchema,
} from "@/lib/consultations/validation";

/**
 * PATCH /api/consultations/:id
 *   { "status": "completed" | "scheduled" | "cancelled" }  complete / incomplete / cancel
 *   { "scheduledAt": "<ISO 8601>" }                        reschedule
 *
 * There's no DELETE: cancelling is a state change that keeps history.
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { supabase, user } = await requireApiUser("student");

    const parsedId = consultationIdSchema.safeParse((await params).id);
    if (!parsedId.success) throw notFound("Consultation");

    const input = await parseJsonBody(request, updateConsultationSchema);
    const consultation = await updateConsultation(supabase, user.id, parsedId.data, input);
    return NextResponse.json(consultation);
  },
);
