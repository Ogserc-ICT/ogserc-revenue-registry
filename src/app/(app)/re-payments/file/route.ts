import { eq } from "drizzle-orm";
import { db } from "@/db";
import { handoverBatches } from "@/db/schema";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { actorOf, getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/** GET /re-payments/file?batch=OGSERC/EXP/2026/0001: the workbook a batch was imported from. Audited. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in to download.", { status: 401 });
  if (!can(user.roles, "handover.view")) return new Response("Your role can't download this.", { status: 403 });

  const batchNo = (new URL(req.url).searchParams.get("batch") ?? "").slice(0, 40);
  const [b] = await db
    .select({ fileName: handoverBatches.fileName, fileBytes: handoverBatches.fileBytes })
    .from(handoverBatches)
    .where(eq(handoverBatches.batchNo, batchNo));
  if (!b) return new Response("Not found", { status: 404 });

  await writeAudit(db, { actor: actorOf(user), action: AUDIT_ACTIONS.exported, reference: b.fileName, details: { batchNo, original: true } });
  const safeName = b.fileName.replace(/[^\w.() -]/g, "_");
  return new Response(new Uint8Array(b.fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
