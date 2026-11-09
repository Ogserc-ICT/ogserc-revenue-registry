import { db } from "@/db";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { workbookResponse } from "@/lib/excel";
import { EXPORTS } from "@/lib/exports";
import { can } from "@/lib/permissions";
import { actorOf, getCurrentUser } from "@/lib/session";
import { getViewingYear } from "@/lib/settings-server";

export const runtime = "nodejs";

/**
 * GET /export/<name>.xlsx[?filters]: an Excel download. Checks the user's role for that export
 * on the server and writes an "Export" audit entry (BUILD_SPEC 4.11).
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in to export.", { status: 401 });
  const def = EXPORTS[(await params).file];
  if (!def) return new Response("Not found", { status: 404 });
  if (!can(user.roles, def.capability)) return new Response("Your role can't export this.", { status: 403 });

  const q = new URL(req.url).searchParams;
  const requested = Number(q.get("fy"));
  const fy = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : await getViewingYear();
  const result = await def.build(q, fy);

  await writeAudit(db, {
    actor: actorOf(user),
    action: AUDIT_ACTIONS.exported,
    reference: result.filename,
    details: { rows: result.rows, ...(q.size ? { filters: Object.fromEntries(q.entries()) } : {}) },
  });
  return workbookResponse(result.workbook, result.filename);
}
