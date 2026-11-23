"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBookConsultation } from "@/hooks/use-consultations";
import { ApiRequestError } from "@/lib/api/client";
import {
  bookingFormSchema,
  bookingHorizon,
  isoToLocalInput,
  localInputToIso,
  REASON_MAX,
  type BookingFormValues,
} from "@/lib/consultations/validation";
import { NAME_MAX } from "@/lib/profiles/validation";
import { FormField } from "@/components/form-field";

export function BookConsultationDialog({
  defaultFirstName,
  defaultLastName,
}: {
  defaultFirstName: string;
  defaultLastName: string;
}) {
  const [open, setOpen] = useState(false);
  const book = useBookConsultation();

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      firstName: defaultFirstName,
      lastName: defaultLastName,
      reason: "",
      scheduledAt: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await book.mutateAsync({ ...values, scheduledAt: localInputToIso(values.scheduledAt) });
      toast.success("Consultation booked");
      form.reset();
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.details?.length) {
        // Put server-side validation errors on the matching fields.
        err.details.forEach((d) =>
          form.setError(d.path as FieldPath<BookingFormValues>, { message: d.message }),
        );
      } else {
        toast.error(err instanceof Error ? err.message : "Could not book consultation");
      }
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" /> Book consultation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a consultation</DialogTitle>
          <DialogDescription>Times are in your local timezone.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input id="firstName" maxLength={NAME_MAX} {...form.register("firstName")} />
            </FormField>
            <FormField label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
              <Input id="lastName" maxLength={NAME_MAX} {...form.register("lastName")} />
            </FormField>
          </div>
          <FormField label="Reason for consultation" htmlFor="reason" error={errors.reason?.message}>
            <Textarea id="reason" rows={4} maxLength={REASON_MAX} {...form.register("reason")} />
          </FormField>
          <FormField label="Date and time" htmlFor="scheduledAt" error={errors.scheduledAt?.message}>
            <Input
              id="scheduledAt"
              type="datetime-local"
              min={isoToLocalInput(new Date())}
              max={isoToLocalInput(bookingHorizon())}
              {...form.register("scheduledAt")}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Booking..." : "Book consultation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
