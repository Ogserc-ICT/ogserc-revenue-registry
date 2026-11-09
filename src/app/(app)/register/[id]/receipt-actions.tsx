"use client";

import { Check, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmReceiptsAction } from "../actions";
import { ReverseDialog } from "../register-table";

export function ConfirmButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await confirmReceiptsAction([id]);
          if (!r.ok) return toast(r.error, "error");
          toast(r.message ?? "Confirmed");
          router.refresh();
        })
      }
    >
      <Check aria-hidden className="size-4" /> {pending ? "Confirming…" : "Confirm receipt"}
    </Button>
  );
}

export function ReverseButton({ id, receiptNo }: { id: string; receiptNo: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden className="size-4" /> Reverse receipt
      </Button>
      <ReverseDialog
        open={open}
        onClose={() => setOpen(false)}
        ids={[id]}
        title={`Reverse ${receiptNo}?`}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
