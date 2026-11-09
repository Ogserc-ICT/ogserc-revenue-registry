import "server-only";
import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { feeHeads, licenceFeeBands, payers } from "@/db/schema";
import { lagosToday } from "@/lib/dates";
import { openNoticesForPayer } from "@/lib/dn-service";
import { getListValues, withCurrent } from "@/lib/lists-server";
import { peekSerial } from "@/lib/numbering";
import { getSettings } from "@/lib/settings-server";
import type { OpenNotice } from "./actions";
import type { ReceiptFormProps } from "./receipt-form";

/**
 * Everything the receipt form needs. Active payers and heads only, plus the receipt's own payer,
 * head, channel and account when editing (so a later deactivation doesn't block the edit).
 */
export async function getReceiptFormData(current?: {
  payerId: string;
  revenueCode: string;
  channel: string;
  collectingAccount: string;
}): Promise<Omit<ReceiptFormProps, "mode" | "initial" | "receiptId" | "receiptNo" | "currentNotice" | "initialNotices">> {
  const [payerRows, feeRows, bandRows, channels, accounts, settings, nextSerial] = await Promise.all([
    db
      .select({
        payerId: payers.payerId,
        name: payers.name,
        category: payers.category,
        licenceNo: payers.licenceNo,
        capacityMw: payers.capacityMw,
        revenueBaseNgn: payers.revenueBaseNgn,
      })
      .from(payers)
      .where(current ? or(eq(payers.active, true), eq(payers.payerId, current.payerId)) : eq(payers.active, true))
      .orderBy(asc(payers.name)),
    db
      .select({
        code: feeHeads.code,
        head: feeHeads.head,
        category: feeHeads.category,
        revenueType: feeHeads.revenueType,
        basis: feeHeads.basis,
        currency: feeHeads.currency,
        publishedRate: feeHeads.publishedRate,
        capNgn: feeHeads.capNgn,
        unitBasis: feeHeads.unitBasis,
      })
      .from(feeHeads)
      .where(current ? or(eq(feeHeads.active, true), eq(feeHeads.code, current.revenueCode)) : eq(feeHeads.active, true))
      .orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code)),
    db
      .select({
        code: licenceFeeBands.code,
        aboveMw: licenceFeeBands.aboveMw,
        upToMw: licenceFeeBands.upToMw,
        publishedRate: licenceFeeBands.publishedRate,
        currency: licenceFeeBands.currency,
      })
      .from(licenceFeeBands),
    getListValues("Payment channels"),
    getListValues("Collecting accounts"),
    getSettings(),
    peekSerial(db, "receipt"),
  ]);
  return {
    payers: payerRows,
    fees: feeRows,
    bands: bandRows,
    channels: withCurrent(channels, current?.channel),
    accounts: withCurrent(accounts, current?.collectingAccount),
    usdNgnRate: settings.usdNgnRate,
    receiptPrefix: settings.receiptPrefix,
    nextSerial,
    autoConfirm: settings.autoConfirm,
  };
}

/** Open notices for a payer, plus `current` (the receipt's own notice) if it has since closed. */
export async function getInitialNotices(payerId: string, current?: OpenNotice): Promise<OpenNotice[]> {
  if (!payerId) return [];
  const list = (await openNoticesForPayer(db, payerId, lagosToday())).map((r) => ({
    dnNo: r.dnNo,
    revenueCode: r.revenueCode,
    revenueHead: r.revenueHead,
    issueDate: r.issueDate,
    outstanding: r.outstanding,
  }));
  return current && !list.some((n) => n.dnNo === current.dnNo) ? [current, ...list] : list;
}
