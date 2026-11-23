import { Badge } from "@/components/ui/badge";
import {
  CONSULTATION_STATUS_LABELS,
  type ConsultationStatus,
} from "@/lib/consultations/types";

const STATUS_VARIANT: Record<ConsultationStatus, "default" | "outline" | "destructive"> = {
  scheduled: "outline",
  completed: "default",
  cancelled: "destructive",
};

export function StatusBadge({ status }: { status: ConsultationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{CONSULTATION_STATUS_LABELS[status]}</Badge>;
}
