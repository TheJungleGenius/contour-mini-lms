import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/errors";
import { parseJsonBody, parseSearchParams } from "@/lib/api/request";
import { requireApiUser } from "@/lib/auth/guards";
import {
  createConsultation,
  listStudentConsultations,
} from "@/lib/consultations/repository";
import {
  createConsultationSchema,
  listConsultationsQuerySchema,
} from "@/lib/consultations/validation";

/** GET /api/consultations?status=&cursor=&limit= : the student's own consultations. */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, user } = await requireApiUser("student");
  const query = parseSearchParams(request, listConsultationsQuerySchema);

  const page = await listStudentConsultations(supabase, user.id, query);
  return NextResponse.json(page);
});

/** POST /api/consultations : book a consultation. */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase } = await requireApiUser("student");
  const input = await parseJsonBody(request, createConsultationSchema);

  const consultation = await createConsultation(supabase, input);
  return NextResponse.json(consultation, {
    status: 201,
    headers: { Location: `/api/consultations/${consultation.id}` },
  });
});
