"use client";

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
import { useUpdateConsultation } from "@/hooks/use-consultations";
import type { Consultation } from "@/lib/consultations/types";
import { formatDateTime } from "@/lib/format";

export function CancelDialog({
  consultation,
  onOpenChange,
}: {
  consultation: Consultation | null;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateConsultation();

  const onConfirm = async () => {
    if (!consultation) return;
    try {
      await update.mutateAsync({ id: consultation.id, input: { status: "cancelled" } });
      toast.success("Consultation cancelled");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    }
  };

  return (
    <Dialog open={consultation !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this consultation?</DialogTitle>
          <DialogDescription>
            {consultation && (
              <>
                {formatDateTime(consultation.scheduledAt)}: {consultation.reason}
                <br />
                This can&apos;t be undone. You can book a new consultation at any time.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={update.isPending}>
            {update.isPending ? "Cancelling..." : "Cancel consultation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
