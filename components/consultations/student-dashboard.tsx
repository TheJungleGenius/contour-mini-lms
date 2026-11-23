"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyConsultations, useUpdateConsultation } from "@/hooks/use-consultations";
import {
  canCancel,
  canReschedule,
  canToggleComplete,
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_STATUSES,
  type Consultation,
  type ConsultationStatus,
} from "@/lib/consultations/types";
import { BookConsultationDialog } from "./book-consultation-dialog";
import { CancelDialog } from "./cancel-dialog";
import { ListFooter, ListState } from "./list-state";
import { RescheduleDialog } from "./reschedule-dialog";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "./status-badge";

const FILTERS: { value: ConsultationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...CONSULTATION_STATUSES.map((s) => ({ value: s, label: CONSULTATION_STATUS_LABELS[s] })),
];

export function StudentDashboard({
  defaultFirstName,
  defaultLastName,
}: {
  defaultFirstName: string;
  defaultLastName: string;
}) {
  const [filter, setFilter] = useState<ConsultationStatus | "all">("all");
  const [rescheduling, setRescheduling] = useState<Consultation | null>(null);
  const [cancelling, setCancelling] = useState<Consultation | null>(null);

  const query = useMyConsultations(filter === "all" ? undefined : filter);
  const update = useUpdateConsultation();
  const consultations = query.data?.pages.flatMap((p) => p.items) ?? [];

  const toggleComplete = (c: Consultation, checked: boolean) => {
    update.mutate(
      { id: c.id, input: { status: checked ? "completed" : "scheduled" } },
      { onError: (err) => toast.error(err.message) },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My consultations</h1>
          <p className="text-sm text-muted-foreground">
            Tick a consultation to mark it complete.
          </p>
        </div>
        <BookConsultationDialog
          defaultFirstName={defaultFirstName}
          defaultLastName={defaultLastName}
        />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ListState query={query} isEmpty={consultations.length === 0} emptyText="No consultations yet.">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Done</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Booked for</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultations.map((c) => (
                <TableRow key={c.id} className={c.status === "cancelled" ? "opacity-60" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={c.status === "completed" ? "Mark incomplete" : "Mark complete"}
                      checked={c.status === "completed"}
                      disabled={!canToggleComplete(c.status)}
                      onCheckedChange={(checked) => toggleComplete(c, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(c.scheduledAt)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={c.reason}>
                    {c.reason}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    {canReschedule(c.status) && (
                      <Button size="sm" variant="outline" onClick={() => setRescheduling(c)}>
                        Reschedule
                      </Button>
                    )}
                    {canCancel(c.status) && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(c)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ListFooter query={query} />
      </ListState>

      <RescheduleDialog
        consultation={rescheduling}
        onOpenChange={(open) => !open && setRescheduling(null)}
      />
      <CancelDialog consultation={cancelling} onOpenChange={(open) => !open && setCancelling(null)} />
    </div>
  );
}
