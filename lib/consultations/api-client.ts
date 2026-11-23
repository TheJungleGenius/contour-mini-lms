import { apiFetch } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";
import type { AdminConsultation, Consultation, ConsultationStatus } from "./types";
import type { CreateConsultationInput, UpdateConsultationInput } from "./validation";

/**
 * Typed browser client for the consultations REST API: the only client-side
 * module that knows its URLs and HTTP methods. Errors surface as
 * ApiRequestError (see lib/api/client.ts).
 */

const STUDENT_BASE = "/api/consultations";
const ADMIN_BASE = "/api/admin/consultations";

export type ListParams = { status?: ConsultationStatus; cursor?: string };
type RequestOptions = { signal?: AbortSignal };

function withQuery(path: string, { status, cursor }: ListParams) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const consultationsApi = {
  /** The signed-in student's consultations, soonest first. */
  listMine: (params: ListParams, { signal }: RequestOptions = {}) =>
    apiFetch<Page<Consultation>>(withQuery(STUDENT_BASE, params), { signal }),

  /** Every consultation (admin only), latest first. */
  listAll: (params: ListParams, { signal }: RequestOptions = {}) =>
    apiFetch<Page<AdminConsultation>>(withQuery(ADMIN_BASE, params), { signal }),

  create: (input: CreateConsultationInput) =>
    apiFetch<Consultation>(STUDENT_BASE, { method: "POST", json: input }),

  update: (id: string, input: UpdateConsultationInput) =>
    apiFetch<Consultation>(`${STUDENT_BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: input,
    }),
};
