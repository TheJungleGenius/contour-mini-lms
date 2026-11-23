import { Slot } from "radix-ui";
import { Label } from "@/components/ui/label";

/**
 * Label + control + error message. The control is passed as the only child;
 * Slot merges the accessibility attributes into it, so screen readers announce
 * the error and the field's invalid state without each form wiring them up.
 */
export function FormField({
  label,
  htmlFor,
  error,
  labelAction,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  /** Optional element shown at the end of the label row, e.g. a link. */
  labelAction?: React.ReactNode;
  children: React.ReactElement;
}) {
  const errorId = `${htmlFor}-error`;
  return (
    <div className="grid gap-2">
      <div className="flex items-center">
        <Label htmlFor={htmlFor}>{label}</Label>
        {labelAction && <div className="ml-auto text-sm">{labelAction}</div>}
      </div>
      <Slot.Root aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
        {children}
      </Slot.Root>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
