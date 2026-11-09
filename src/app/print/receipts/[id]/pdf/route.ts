import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { z } from "zod";
import { ReceiptPdf } from "@/components/print/receipt-pdf";
import { can } from "@/lib/permissions";
import { getReceiptPrintData } from "@/lib/receipt-print";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/** GET /print/receipts/:id/pdf: the official receipt as an A4 PDF. Same access as the Register. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in to download this receipt.", { status: 401 });
  if (!can(user.roles, "receipts.view")) return new Response("Your role can't view receipts.", { status: 403 });

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  const data = await getReceiptPrintData(id.data);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderToBuffer(createElement(ReceiptPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
  const filename = `${data.r.receiptNo.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
