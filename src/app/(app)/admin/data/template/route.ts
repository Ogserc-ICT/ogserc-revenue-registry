import { toCsv } from "@/lib/csv";
import { IMPORT_COLUMNS } from "@/lib/payer-import";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

/** GET /admin/data/template: the payer import template, with one example row. Admin only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in first.", { status: 401 });
  if (!can(user.roles, "data.manage")) return new Response("Admin only.", { status: 403 });
  const example: Record<string, string> = {
    name: "Example Power Company Ltd",
    category: "Independent Generation Licensee",
    licenceStatus: "Applicant",
    capacityMw: "12.5",
    lga: "Abeokuta South",
    address: "12 Example Road, Abeokuta",
    email: "accounts@example.ng",
    dateRegistered: "2026-01-15",
    sch3Category: "C",
    expectedRegMonth: "6",
  };
  const csv = toCsv([IMPORT_COLUMNS.map(([, label]) => label), IMPORT_COLUMNS.map(([key]) => example[key] ?? "")]);
  // A byte-order mark so Excel opens the file as UTF-8.
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payer-import-template.csv"',
    },
  });
}
