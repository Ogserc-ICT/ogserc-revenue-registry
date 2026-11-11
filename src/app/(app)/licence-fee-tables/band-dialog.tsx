"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { saveBandRateAction } from "./actions";

export function EditBandButton({
  id,
  code,
  bandLabel,
  currency,
  publishedRate,
}: {
  id: number;
  code: string;
  bandLabel: string;
  currency: "NGN" | "USD";
  publishedRate: string;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${code} ${bandLabel}`}
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden className="size-3.5" /> Edit
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${code}: ${bandLabel}`}
        description="Applies to new notices and receipts. Those already saved keep the rate they used."
      >
        <BandForm key={key} id={id} currency={currency} publishedRate={publishedRate} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function BandForm({
  id,
  currency,
  publishedRate,
  onDone,
}: {
  id: number;
  currency: "NGN" | "USD";
  publishedRate: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useFormAction(saveBandRateAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Saved");
      onDone();
    }
  }, [state, toast, onDone]);
  const hint = "Leave blank if the band has no rate; officers then enter the amount by hand.";
  return (
    <form onSubmit={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label={currency === "USD" ? "Rate (US$)" : "Rate (₦)"} htmlFor="publishedRate" hint={hint} error={e?.publishedRate}>
        <MoneyInput
          id="publishedRate"
          name="publishedRate"
          defaultValue={publishedRate}
          data-autofocus
          {...describedBy("publishedRate", e?.publishedRate, hint)}
        />
      </Field>
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save rate"}
        </Button>
      </div>
    </form>
  );
}
