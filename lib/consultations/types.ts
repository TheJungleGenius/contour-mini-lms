// Consultation domain types, shared by the API (server) and the UI (client).
// The API speaks camelCase DTOs; snake_case stays inside the repository.

export const CONSULTATION_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

/** Display label for each status, used by badges and filters alike. */
export const CONSULTATION_STATUS_LABELS: Record<ConsultationStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type Consultation = {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;
  scheduledAt: string; // ISO 8601, UTC
  status: ConsultationStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsultationStudent = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type AdminConsultation = Consultation & {
  student: ConsultationStudent | null;
};

// UI mirrors of the database state machine (the DB trigger is authoritative).
export const canToggleComplete = (s: ConsultationStatus) => s !== "cancelled";
export const canReschedule = (s: ConsultationStatus) => s === "scheduled";
export const canCancel = (s: ConsultationStatus) => s === "scheduled";
