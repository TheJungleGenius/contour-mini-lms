"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminConsultations } from "@/hooks/use-consultations";
import {
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_STATUSES,
  type ConsultationStatus,
} from "@/lib/consultations/types";
import { ListFooter, ListState } from "./list-state";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "./status-badge";

/** Read-only, system-wide view for admins. */
export function AdminConsultationsTable() {
  const [status, setStatus] = useState<ConsultationStatus | "all">("all");
  const query = useAdminConsultations(status === "all" ? undefined : status);
  const consultations = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">All consultations</h1>
          <p className="text-sm text-muted-foreground">
            Every consultation across the system, latest first. Read-only.
          </p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CONSULTATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONSULTATION_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ListState query={query} isEmpty={consultations.length === 0} emptyText="No consultations found.">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Student account</TableHead>
                <TableHead>Booked for</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Booked at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultations.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(c.scheduledAt)}</TableCell>
                  <TableCell>
                    {c.student ? (
                      <div className="flex flex-col">
                        <span>
                          {c.student.firstName} {c.student.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.student.email}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={c.reason}>
                    {c.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ListFooter query={query} />
      </ListState>
    </div>
  );
}
