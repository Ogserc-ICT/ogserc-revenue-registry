import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { z } from "zod";
import { DnPdf } from "@/components/print/dn-pdf";
import { getDnPrintData } from "@/lib/dn-print";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/** GET /print/demand-notices/:id/pdf: the notice as an A4 PDF download. Same access as viewing it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in to download this notice.", { status: 401 });
  if (!can(user.roles, "dn.view")) return new Response("Your role can't view demand notices.", { status: 403 });

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  const data = await getDnPrintData(id.data);
  if (!data) return new Response("Not found", { status: 404 });

  // createElement keeps this a .ts route; the cast bridges react-pdf's Document-only prop type.
  const pdf = await renderToBuffer(createElement(DnPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
  const filename = `${data.dn.dnNo.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
