"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUpdateConsultation } from "@/hooks/use-consultations";
import type { Consultation } from "@/lib/consultations/types";
import {
  bookingHorizon,
  isoToLocalInput,
  localInputToIso,
  rescheduleFormSchema,
  type RescheduleFormValues,
} from "@/lib/consultations/validation";
import { FormField } from "@/components/form-field";
import { formatDateTime } from "@/lib/format";

export function RescheduleDialog({
  consultation,
  onOpenChange,
}: {
  consultation: Consultation | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateConsultation();
  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleFormSchema),
    defaultValues: { scheduledAt: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (consultation) form.reset({ scheduledAt: isoToLocalInput(consultation.scheduledAt) });
  }, [consultation, form]);

  const onSubmit = form.handleSubmit(async ({ scheduledAt }) => {
    if (!consultation) return;
    try {
      await update.mutateAsync({
        id: consultation.id,
        input: { scheduledAt: localInputToIso(scheduledAt) },
      });
      toast.success("Consultation rescheduled");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reschedule");
    }
  });

  return (
    <Dialog open={consultation !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule consultation</DialogTitle>
          <DialogDescription>
            {consultation && <>Currently {formatDateTime(consultation.scheduledAt)}.</>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField label="New date and time" htmlFor="newScheduledAt" error={errors.scheduledAt?.message}>
            <Input
              id="newScheduledAt"
              type="datetime-local"
              min={isoToLocalInput(new Date())}
              max={isoToLocalInput(bookingHorizon())}
              {...form.register("scheduledAt")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
