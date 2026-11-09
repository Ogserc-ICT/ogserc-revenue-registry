"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CancelDialog } from "../cancel-dialog";

export function CancelButton({ id, dnNo }: { id: string; dnNo: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Ban aria-hidden className="size-4" /> Cancel notice
      </Button>
      <CancelDialog
        open={open}
        onClose={() => setOpen(false)}
        ids={[id]}
        title={`Cancel ${dnNo}?`}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
