"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cancelDnAction } from "./actions";

/** Asks for the reason, then cancels. Shared by the register's bulk bar and a notice's own page. */
export function CancelDialog({
  open,
  onClose,
  ids,
  title,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  title: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const n = ids.length;

  const submit = () =>
    startTransition(async () => {
      const r = await cancelDnAction(ids, reason);
      if (!r.ok) {
        setError(r.fieldErrors?.reason ?? r.error);
        return;
      }
      toast(r.message ?? "Cancelled");
      setReason("");
      setError(null);
      onDone();
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Cancelled notices stay on the register, show as Cancelled and count as nothing outstanding. This can't be undone."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Field label="Reason" htmlFor="cancel-reason" required error={error ?? undefined}>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            data-autofocus
            placeholder="e.g. Issued to the wrong payer"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "cancel-reason-error" : undefined}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep {n === 1 ? "it" : "them"}
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Cancelling…" : `Cancel ${n} ${n === 1 ? "notice" : "notices"}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
