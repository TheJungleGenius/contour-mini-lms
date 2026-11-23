import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/request";
import { requireApiUser } from "@/lib/auth/guards";
import { listAllConsultations } from "@/lib/consultations/repository";
import { listConsultationsQuerySchema } from "@/lib/consultations/validation";

/**
 * GET /api/admin/consultations?status=&cursor=&limit=
 * Read-only, system-wide list. Non-admins get 404. RLS separately guarantees
 * that only an admin JWT can see other users' rows.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase } = await requireApiUser("admin");
  const query = parseSearchParams(request, listConsultationsQuerySchema);

  const page = await listAllConsultations(supabase, query);
  return NextResponse.json(page);
});
