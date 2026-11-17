import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { Card, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { gatePage } from "@/lib/session";

export const metadata: Metadata = { title: "Guide" };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium underline underline-offset-2">
    {children}
  </Link>
);

/** One step, rule or tip: a short title and the explanation. */
function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[13rem_1fr] sm:gap-6">
      <dt className="font-medium">{title}</dt>
      <dd className="max-w-[72ch] text-muted">{children}</dd>
    </div>
  );
}

/**
 * How to use the app, adapted from the workbook's Guide sheet (BUILD_SPEC 11, phase 6). Plain
 * text, the same for every role; the "Your role" card says what the reader can do.
 */
export default async function GuidePage() {
  const gate = await gatePage("reports.view");
  if (!gate.ok) return <NoAccess title="Guide" />;
  const roles = gate.user.roles;
  const youCan = [
    can(roles, "receipts.record") && "record receipts",
    can(roles, "dn.issue") && "issue demand notices",
    can(roles, "payers.edit") && "add and edit payers",
    can(roles, "receipts.confirm") && "confirm and reverse receipts",
    can(roles, "dn.cancel") && "cancel demand notices",
    can(roles, "handover.import") && "import R&E payment batches",
    can(roles, "receiver.edit") && "update Receiver details",
    can(roles, "settings.manage") && "change settings, lists and users",
    "read the reports",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title="Guide" description="How to record receipts, issue notices and read the reports, and the controls built in." />

      <Card className="mb-10 flex flex-col gap-2 p-5">
        <p className="text-sm text-muted">Your role</p>
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <StatusPill key={r} tone={r === "admin" ? "gold" : "muted"}>
              {ROLE_LABELS[r]}
            </StatusPill>
          ))}
        </div>
        <p>You can {youCan.length > 1 ? `${youCan.slice(0, -1).join(", ")} and ${youCan.at(-1)}` : youCan[0]}.</p>
      </Card>

      <section className="mb-10">
        <SectionHeading title="The workflow" />
        <Card className="p-5">
          <dl>
            <Item title="1. Set up (Admin)">
              In <A href="/admin/settings">Settings &amp; lists</A>, confirm the financial year, numbering and the US$ exchange rate. In{" "}
              <A href="/admin/receiver-details">Receiver details</A>, Finance keeps OGSERC&apos;s address, bank accounts and signatory
              current: they print on every notice and receipt. On the <A href="/fee-schedule">Fee schedule</A>, check each head&apos;s rate and
              rate status before live billing.
            </Item>
            <Item title="2. Register payers">
              <A href="/payers">Payers</A> › Add payer gives the next payer ID. The name must be unique; address and capacity (MW, 0 if
              none) are required. Capacity drives Per-MW and MW-band fees; the revenue base drives % levies. The Schedule 3 category
              sets the registration fee, and is suggested from the payer category.
            </Item>
            <Item title="3. Bill (optional)">
              <A href="/new-demand-notice">New demand notice</A>: pick the payer and revenue head. The panel under the head says what it
              stands for and the amount to be paid; the amount is computed from the fee schedule (override it for penalties and other
              variable heads). Issue &amp; print opens the notice and its PDF.
            </Item>
            <Item title="4. Record a payment">
              <A href="/new-receipt">New receipt</A>: pick the payer, the revenue head and, if any, the demand notice being paid. Enter the
              amount exactly as on the bank or Remita evidence, the channel, account and RRR or reference. Saving checks for missing
              fields and duplicate references, gives the receipt its number and puts it on the <A href="/register">Register</A> as
              Pending confirmation. Registration is a one-off payment: once a payer&apos;s fee is covered, a second registration receipt is
              refused.
            </Item>
            <Item title="5. Finance confirms">
              Finance matches pending receipts to the bank or TSA statement (<A href="/bank-recon">Bank recon</A> helps), selects them on the
              Register and confirms. Only confirmed receipts count as revenue, reduce notice balances and appear in reports. A receipt
              prints as PROVISIONAL until it is confirmed. You can&apos;t confirm a receipt you recorded yourself.
            </Item>
            <Item title="6. Corrections">
              Nothing is ever deleted. Select a wrong receipt, choose Reverse, give the reason, then record the correct one. Reversed
              receipts stay on the Register, struck through, and drop out of every total. Wrong demand notices are cancelled the same way.
            </Item>
            <Item title="7. R&E payments">
              Registration payments confirmed in the Registration &amp; Evaluation app arrive as batch files. Finance imports each{" "}
              <code>.xlsx</code> on <A href="/re-payments">R&amp;E payments</A>, in order: a file that has been altered, or a reversal before its
              payment, is refused whole. These payments are kept apart from receipts, so don&apos;t record them again as receipts.
            </Item>
            <Item title="8. Report">
              The <A href="/dashboard">Dashboard</A>, <A href="/monthly-summary">Monthly summary</A>,{" "}
              <A href="/budget-vs-actual">Budget vs actual</A>, <A href="/arrears">Arrears</A> and Bank recon update as receipts are
              confirmed. Each has an Excel download. The FY chip at the top switches the year you&apos;re viewing.
            </Item>
          </dl>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading title="Controls built in" />
        <Card className="p-5">
          <dl>
            <Item title="Separate duties">Revenue officers record; Finance confirms. Roles decide who can do what, checked on the server for every action.</Item>
            <Item title="Duplicate check">A payment reference or RRR already on the Register (and not reversed) is blocked when you save.</Item>
            <Item title="Numbering">Receipt, notice and payer numbers are given when the record is saved and never reused, even after a reversal or cancellation.</Item>
            <Item title="Audit log">
              Every change, sign-in, export and import is written to the <A href="/audit-log">Audit log</A> with who and when. It can&apos;t be
              edited or deleted.
            </Item>
            <Item title="Sign-in lock">
              Five wrong passwords within 15 minutes lock the account for 15 minutes. An Admin can unlock it straight away by resetting the
              password on Users.
            </Item>
            <Item title="History stays true">Receipts and notices keep the payer, head and rate as they were when saved, so a later change to the fee schedule never rewrites the past.</Item>
          </dl>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading title="Good practice" />
        <Card className="p-5">
          <dl>
            <Item title="Backups">
              The database is copied every night, encrypted, and kept for 90 days. Finance should also download{" "}
              {can(roles, "data.manage") ? <A href="/admin/data">Export everything</A> : "Export everything (Admin › Data)"} weekly and keep it
              on an OGSERC drive.
            </Item>
            <Item title="Your account">Never share your sign-in. Each person has their own, so the audit log shows who did what. Sign out on shared computers.</Item>
            <Item title="New year">Change the financial year in Settings. Numbers carry on; they never restart, and the year is part of every number.</Item>
          </dl>
        </Card>
      </section>

      <section>
        <SectionHeading title="Fees and budget" />
        <Card className="p-5">
          <dl>
            <Item title="Fee schedule">78 revenue heads in 11 categories, from Schedule 3 registration to operating levies, permits, penalties and grants.</Item>
            <Item title="Registration fees">
              Schedule 3 Parts A and B are on <A href="/registration-fees">Registration fees</A>, with a late-registration calculator. For late
              registration, bill the initial charge and the daily charge with quantity = days late; the cap is applied for you.
            </Item>
            <Item title="MW band fees">
              Band fees look up the payer&apos;s installed capacity in <A href="/licence-fee-tables">Licence fee tables</A>. US$ fees convert at
              the exchange rate in Settings.
            </Item>
            <Item title="Revenue budget">
              The year&apos;s budget by revenue line is on <A href="/revenue-budget">Revenue budget</A>. Every fee head carries a budget line, so
              confirmed receipts roll up against the budget to date and for the full year.
            </Item>
          </dl>
        </Card>
      </section>
    </>
  );
}
