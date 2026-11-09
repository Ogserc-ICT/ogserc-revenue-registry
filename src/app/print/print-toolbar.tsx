"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

/** Screen-only toolbar above a print document; hidden when printing. */
export function PrintToolbar({ backHref, pdfHref }: { backHref: string; pdfHref: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href={backHref} className={buttonClass("ghost", "sm")}>
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Link>
        <div className="flex gap-2">
          <a href={pdfHref} className={buttonClass("secondary", "sm")}>
            <Download aria-hidden className="size-4" /> Download PDF
          </a>
          <Button size="sm" onClick={() => window.print()}>
            <Printer aria-hidden className="size-4" /> Print
          </Button>
        </div>
      </div>
    </div>
  );
}
