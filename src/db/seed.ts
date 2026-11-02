import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "./index";
import {
  budgetLines,
  demandNotices,
  feeHeads,
  licenceFeeBands,
  lists,
  payers,
  receipts,
  revenueBudget,
  sch3LateCharges,
  sch3RegistrationFees,
  serials,
  settings,
} from "./schema";
import { AUDIT_ACTIONS, SYSTEM_ACTOR, writeAudit } from "@/lib/audit";
import { RUNNING_SERIAL_YEAR } from "@/lib/numbering";

/** Dropdown lists that admins can edit. Payment Status, Charging Basis, Revenue Type and Currency are enums. */
export const EDITABLE_LISTS = {
  "Payment Channels": "Payment channels",
  "Collecting Accounts": "Collecting accounts",
  "Payer Categories": "Payer categories",
  "Licence Status": "Licence status",
  "Ogun State LGAs": "LGAs",
  Frequency: "Frequency",
  "Revenue Categories": "Revenue categories",
} as const;

export type ListName = (typeof EDITABLE_LISTS)[keyof typeof EDITABLE_LISTS];

type Json = Record<string, unknown>;

function readSeed<T>(seedDir: string, file: string): T {
  return JSON.parse(readFileSync(path.join(seedDir, file), "utf8")) as T;
}

const num = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/** Workbook timestamps are Lagos local time without an offset. */
const lagosTimestamp = (v: unknown): Date | null => (v ? new Date(`${String(v)}+01:00`) : null);

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

export interface SeedOptions {
  withSample: boolean;
  seedDir?: string;
}

export interface SeedResult {
  feeHeads: number;
  licenceFeeBands: number;
  sch3RegistrationFees: number;
  sch3LateCharges: number;
  budgetLines: number;
  budgetRows: number;
  listValues: number;
  payers: number;
  samplePayers: number;
  demandNotices: number;
  receipts: number;
}

/**
 * Loads seed/*.json. Safe to run again: existing rows are kept as they are (an admin's later
 * edits are never overwritten) and serials are only ever raised.
 */
export async function seedDatabase(db: Db, options: SeedOptions): Promise<SeedResult> {
  const seedDir = options.seedDir ?? path.join(process.cwd(), "seed");
  const settingsJson = readSeed<{ settings: Json; lists: Record<string, string[]> }>(
    seedDir,
    "settings.json",
  );
  const feeJson = readSeed<Json[]>(seedDir, "fee_heads.json");
  const bandJson = readSeed<Json[]>(seedDir, "licence_fee_bands.json");
  const sch3Json = readSeed<Json[]>(seedDir, "schedule3_registration_fees.json");
  const lateJson = readSeed<Json[]>(seedDir, "schedule3_late_charges.json");
  const budgetJson = readSeed<{ version: string; lines: (Json & { monthly: number[] })[] }>(
    seedDir,
    "revenue_budget_fy2026.json",
  );
  const payerJson = readSeed<Json[]>(seedDir, "payers.json");

  const s = settingsJson.settings;
  const L = settingsJson.lists;

  return db.transaction(async (tx) => {
    // Settings: one row, created once. The sample as-at date (2 Nov 2026) is only used with
    // sample data, so production reports run "as at today".
    await tx
      .insert(settings)
      .values({
        id: 1,
        orgName: String(s["Organisation name"]),
        addressLine: String(s["Address / contact line"] ?? ""),
        financialYear: Number(s["Financial year"]),
        receiptPrefix: String(s["Receipt number prefix"]),
        dnPrefix: String(s["Demand notice prefix"]),
        payerPrefix: String(s["Payer ID prefix"]),
        defaultTermsDays: Number(s["Default payment terms (days)"]),
        asAtDate: options.withSample ? String(s["Report as-at date"]) : null,
        autoConfirm: s["Auto-confirm receipts on save"] === "Yes",
        usdNgnRate: String(s["USD / NGN exchange rate (₦ per US$)"]),
        budgetVersionLabel: String(s["Revenue budget version"] ?? ""),
        budgetToDateRule: "including_current_month",
        dnPaymentInstructions: String(s["Demand notice payment instructions"] ?? ""),
        dnSignatory: String(s["Demand notice signatory"] ?? ""),
        latePaymentNote: String(s["Late payment note"] ?? ""),
      })
      .onConflictDoNothing();

    // Lists
    let listValues = 0;
    for (const [source, listName] of Object.entries(EDITABLE_LISTS)) {
      const values = L[source] ?? [];
      if (values.length === 0) continue;
      await tx
        .insert(lists)
        .values(values.map((value, i) => ({ listName, value, sortOrder: (i + 1) * 10 })))
        .onConflictDoNothing();
      listValues += values.length;
    }

    // Budget lines: three parallel arrays in the workbook's Lists sheet.
    const ids = L["Budget Line ID"] ?? [];
    const lineRows = ids.map((id, i) => {
      const groupName = L["Budget Group"]?.[i] ?? "";
      return {
        id,
        name: L["Budget Line"]?.[i] ?? id,
        groupCode: groupName.charAt(0) || id.charAt(3),
        groupName,
        sortOrder: (i + 1) * 10,
      };
    });
    await tx.insert(budgetLines).values(lineRows).onConflictDoNothing();

    // Fee heads
    await tx
      .insert(feeHeads)
      .values(
        feeJson.map((f, i) => ({
          code: String(f.code),
          head: String(f.head),
          category: String(f.category),
          appliesTo: str(f.applies_to),
          basis: f.basis as (typeof feeHeads.$inferInsert)["basis"],
          currency: (f.currency as "NGN" | "USD") ?? "NGN",
          publishedRate: num(f.published_rate),
          capNgn: num(f.cap_ngn),
          unitBasis: str(f.unit_basis),
          frequency: str(f.frequency),
          revenueType: f.revenue_type as "IGR" | "Non-IGR",
          budgetLineId: str(f.budget_line),
          legalBasis: str(f.legal_basis),
          ncoaCode: str(f.ncoa_code),
          rateStatus: str(f.rate_status),
          notes: str(f.notes),
          sortOrder: (i + 1) * 10,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(sch3RegistrationFees)
      .values(
        sch3Json.map((r) => ({
          category: String(r.category),
          registrant: String(r.registrant),
          feeNgn: String(r.fee_ngn),
          // Category I is "Not listed": no late charge applies.
          lateGroup: typeof r.late_group === "string" && r.late_group.startsWith("LR-") ? r.late_group : null,
          revenueCode: String(r.revenue_code),
          budgetLineId: str(r.budget_line),
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(sch3LateCharges)
      .values(
        lateJson.map((r) => ({
          group: String(r.group),
          categories: String(r.categories),
          initialNgn: String(r.initial_ngn),
          dailyNgn: String(r.daily_ngn),
          dailyCapNgn: String(r.daily_cap_ngn),
          initialCode: String(r.initial_code),
          dailyCode: String(r.daily_code),
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(licenceFeeBands)
      .values(
        bandJson.map((b) => ({
          code: String(b.code),
          fee: String(b.fee),
          bandLabel: String(b.band),
          aboveMw: String(b.above_mw),
          upToMw: String(b.up_to_mw),
          publishedRate: num(b.published_rate),
          currency: b.currency as "NGN" | "USD",
          source: str(b.source),
        })),
      )
      .onConflictDoNothing();

    // FY2026 revenue budget (Budget V2 phasing), stored at full precision.
    const fy = 2026;
    const budgetRows = budgetJson.lines.flatMap((line) =>
      line.monthly.map((amount, m) => ({
        financialYear: fy,
        budgetLineId: String(line.id),
        month: m + 1,
        amount: String(amount),
        sourceNote: [budgetJson.version, str(line.note)].filter(Boolean).join(" | "),
      })),
    );
    await tx.insert(revenueBudget).values(budgetRows).onConflictDoNothing();

    // Payers: the 36 real ones always; the 10 sample ones only with --with-sample.
    const payerRows = payerJson
      .filter((p) => options.withSample || p.is_sample !== true)
      .map((p) => ({
        payerId: String(p.payer_id),
        name: String(p.name),
        category: str(p.category),
        licenceNo: str(p.licence_no),
        licenceStatus: str(p.licence_status),
        capacityMw: num(p.capacity_mw),
        revenueBaseNgn: num(p.revenue_base_ngn),
        lga: str(p.lga),
        address: str(p.address),
        contactPerson: str(p.contact_person),
        phone: str(p.phone),
        email: str(p.email),
        dateRegistered: str(p.date_registered),
        notes: str(p.notes),
        sch3Category: str(p.sch3_category),
        expectedRegMonth: str(p.expected_reg_month),
        isSample: p.is_sample === true,
        createdBy: "Seed",
      }));
    await tx.insert(payers).values(payerRows).onConflictDoNothing();

    let dnCount = 0;
    let receiptCount = 0;
    if (options.withSample) {
      const dnJson = readSeed<Json[]>(seedDir, "sample_demand_notices.json");
      const rcJson = readSeed<Json[]>(seedDir, "sample_receipts.json");
      const feeByCode = new Map(feeJson.map((f) => [String(f.code), f]));

      await tx
        .insert(demandNotices)
        .values(
          dnJson.map((d) => ({
            dnNo: String(d.dn_no),
            issueDate: String(d.issue_date),
            payerId: String(d.payer_id),
            payerName: String(d.payer_name),
            revenueCode: String(d.revenue_code),
            revenueHead: String(d.revenue_head),
            period: str(d.period),
            amountBilled: String(d.amount_billed),
            paymentTermsDays: daysBetween(String(d.issue_date), String(d.due_date)),
            cancelled: d.cancelled === true,
            issuedBy: String(d.issued_by),
            remarks: str(d.remarks),
            isSample: true,
            createdAt: lagosTimestamp(`${String(d.issue_date)}T09:00:00`) ?? undefined,
          })),
        )
        .onConflictDoNothing();
      dnCount = dnJson.length;

      await tx
        .insert(receipts)
        .values(
          rcJson.map((r) => {
            const fee = feeByCode.get(String(r.revenue_code));
            const reversed = r.status === "Reversed";
            // The workbook only kept the reversal in remarks: "SAMPLE | REVERSED 12-Sep-2026: wrong revenue head".
            const rev = reversed
              ? /REVERSED (\d{2})-(\w{3})-(\d{4}):\s*(.+)$/.exec(String(r.remarks ?? ""))
              : null;
            const reversedAt = rev ? new Date(`${rev[2]} ${rev[1]}, ${rev[3]} 12:00:00 GMT+0100`) : null;
            return {
              receiptNo: String(r.receipt_no),
              receiptDate: String(r.receipt_date),
              payerId: String(r.payer_id),
              payerName: String(r.payer_name),
              payerCategory: str(r.payer_category),
              revenueCode: String(r.revenue_code),
              revenueHead: String(r.revenue_head),
              revenueCategory: String(r.revenue_category),
              revenueType: r.revenue_type as "IGR" | "Non-IGR",
              budgetLineId: fee ? str(fee.budget_line) : null,
              dnNo: str(r.dn_ref),
              period: str(r.period),
              basisQty: num(r.basis_qty),
              amountDue: String(r.amount_due),
              amountPaid: String(r.amount_paid),
              channel: String(r.channel),
              collectingAccount: String(r.account),
              paymentRef: String(r.payment_ref),
              valueDate: String(r.value_date ?? r.receipt_date),
              status: r.status as "Pending Confirmation" | "Confirmed" | "Reversed",
              confirmedBy: str(r.confirmed_by),
              confirmedAt: lagosTimestamp(r.confirmed_at),
              reversedBy: reversed ? "Finance Officer (SAMPLE)" : null,
              reversedAt,
              reverseReason: rev ? rev[4]!.trim() : null,
              recordedBy: String(r.recorded_by),
              remarks: str(r.remarks),
              isSample: true,
              createdAt: lagosTimestamp(r.entered_at) ?? undefined,
            };
          }),
        )
        .onConflictDoNothing();
      receiptCount = rcJson.length;
    }

    // Serials (BUILD_SPEC 6). GREATEST() means a re-run never lowers a counter.
    const nextSerials = options.withSample
      ? { receipt: 18, dn: 8, payer: 47 }
      : { receipt: 1, dn: 1, payer: 47 };
    for (const [key, nextValue] of Object.entries(nextSerials)) {
      await tx
        .insert(serials)
        .values({ key: key as "receipt" | "dn" | "payer", year: RUNNING_SERIAL_YEAR, nextValue })
        .onConflictDoUpdate({
          target: [serials.key, serials.year],
          set: { nextValue: sql`GREATEST(${serials.nextValue}, excluded.next_value)` },
        });
    }

    const result: SeedResult = {
      feeHeads: feeJson.length,
      licenceFeeBands: bandJson.length,
      sch3RegistrationFees: sch3Json.length,
      sch3LateCharges: lateJson.length,
      budgetLines: lineRows.length,
      budgetRows: budgetRows.length,
      listValues,
      payers: payerRows.length,
      samplePayers: payerRows.filter((p) => p.isSample).length,
      demandNotices: dnCount,
      receipts: receiptCount,
    };

    await writeAudit(tx, {
      actor: SYSTEM_ACTOR,
      action: AUDIT_ACTIONS.seedLoaded,
      reference: options.withSample ? "with sample data" : "reference data only",
      details: { ...result },
    });

    return result;
  });
}
