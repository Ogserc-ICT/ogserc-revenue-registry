# OGSERC Revenue Register — Web App Build Spec

**Source:** `OGSERC_Revenue_Register_FMS_v2.xlsm` (20 sheets, ~39,000 formulas, VBA module `modRevenue`).
**Goal:** Rebuild the workbook as a staff-only web app for OGSERC's Finance & Accounts and Revenue units, hosted on Vercel (Hobby plan, see section 7).
**Companion files:** `CLAUDE.md` (rules for Claude Code), `DESIGN.md` (dark-mode design system, gradients, motion), `KICKOFF.md` (the prompt to paste for each phase).
**Standalone:** this is a separate project from every other OGSERC app (Registry, Registration & Evaluation, website, ERP). Section 12 lists the isolation rules.
**How to use this file:** Put it in the repo root with the `seed/` folder. Ask Claude Code to read it and build **one phase at a time** (section 11). Each phase ends when its acceptance checks pass.

This spec ports the *logic* of the workbook, not its layout. Where the workbook had a weakness, the fix is marked **[IMPROVEMENT]**.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS with the tokens in `DESIGN.md`. Dark mode by default, with a light-mode toggle (`next-themes`) |
| Motion | `motion` (Framer Motion) for the few orchestrated animations in `DESIGN.md`; CSS transitions for everything else |
| Fonts | Geist Sans via `next/font` (self-hosted, no external font requests), tabular figures for all money |
| Icons | `lucide-react` |
| Database | PostgreSQL on **Neon free plan**, a new Neon project created only for this app (not a branch of another app's database) |
| ORM | Prisma or Drizzle, with migrations committed to the repo |
| Auth | Auth.js with email + password. Admin creates accounts and there is no public sign-up. Passwords hashed with bcrypt/argon2. Session timeout after 30 min idle |
| Charts | Recharts |
| PDF / print | Print-optimised HTML pages with CSS `@page` A4, plus server-side PDF (`@react-pdf/renderer`) for receipts and demand notices |
| Excel export | `exceljs` for exporting registers and reports to .xlsx |
| Validation | Zod on every server action |
| Hosting | Vercel **Hobby** plan, its own Vercel project. Built to be portable so it can move to Vercel Pro, Cloudflare or a self-hosted server without code changes (section 7) |
| Backups | GitHub Actions nightly `pg_dump` (section 7), plus an in-app Excel export |

**Money:** store as `NUMERIC(18,2)` and never as float. Do arithmetic with a decimal library such as `decimal.js`, or in integer kobo.
**Time zone:** all business dates use `Africa/Lagos`. Store timestamps as `timestamptz`.

---

## 2. Roles and permissions

The workbook only separated recording and confirming through a setting. The web app enforces it.

| Role | Can do |
|---|---|
| **Admin** | Everything, including users, settings, fee schedule, budget and serial numbers |
| **Revenue Officer** | Add and edit payers, issue demand notices, record receipts, view reports |
| **Finance Officer** | Confirm receipts, reverse receipts, cancel demand notices, enter bank statement totals, view reports |
| **Viewer** (management) | Read-only dashboards and reports |

Rules:

- **[IMPROVEMENT]** A user cannot confirm a receipt they recorded themselves. Enforce this on the server.
- The `autoConfirm` setting is kept, default `No`. If set to `Yes`, receipts save as Confirmed and `confirmed_by` is set to `"<user> (auto)"`.
- A user may hold more than one role.

---

## 3. Data model

These are the core tables. Column names are suggestions.

- **users**: id, name, email, password_hash, roles[], active, last_login_at.
- **settings** (single row): org_name, address_line, financial_year, receipt_prefix (`OGSERC/RCT`), dn_prefix (`OGSERC/DN`), payer_prefix (`OGS-P-`), default_terms_days (30), as_at_date (nullable; null means today), auto_confirm (bool), usd_ngn_rate (1500), budget_version_label, dn_payment_instructions, dn_signatory, late_payment_note.
- **serials**: key (`receipt`, `dn`, `payer`), year, next_value. These must be incremented inside the same DB transaction as the insert, using `SELECT … FOR UPDATE` or an atomic `UPDATE … RETURNING`.
- **lists**: list_name, value, sort_order, active. These feed every dropdown (payment channels, collecting accounts, payer categories, licence status, LGAs, frequency, revenue categories). Seed from `seed/settings.json → lists`.
  - The values for Payment Status, Charging Basis, Revenue Type and Currency are logic values. Implement them as enums, not editable lists.
- **budget_lines**: id (`BL-A1`…`BL-D5`), name, group (A–D).
- **fee_heads**: code (unique), head, category, applies_to, basis (enum), currency (`NGN`/`USD`), published_rate, published_rate_text, cap_ngn, unit_basis, frequency, revenue_type (`IGR`/`Non-IGR`), budget_line_id, legal_basis, ncoa_code, rate_status, notes, active.
  - Seed from `seed/fee_heads.json` (78 heads).
  - For REG-A to REG-K and LRC-01 to LRC-06, the rate comes from the Schedule 3 tables. Either keep a link to them or copy the rate in on save.
- **sch3_registration_fees**: category A–K, registrant, fee_ngn, late_group (`LR-1`/`LR-2`/`LR-3`/null), revenue_code, budget_line. Seed from `seed/schedule3_registration_fees.json`.
- **sch3_late_charges**: group, categories, initial_ngn, daily_ngn, daily_cap_ngn, initial_code, daily_code. Seed from `seed/schedule3_late_charges.json`.
- **licence_fee_bands**: code, fee, band label, above_mw, up_to_mw, published_rate, currency, source. Seed from `seed/licence_fee_bands.json` (76 rows for PXL-06, GEN-01/02/03, EMG-01/02/03, CAP-02/03).
- **payers**: payer_id (unique, e.g. `OGS-P-0047`), name (**unique, case-insensitive**), category, licence_no, licence_status, capacity_mw, revenue_base_ngn, lga, address, contact_person, phone, email, date_registered, notes, sch3_category, expected_reg_month (`1`–`12` or `Even`), is_sample, created_by, created_at.
  - Seed from `seed/payers.json`. It holds 46 payers: 36 real ones from Budget V2 and 10 with `is_sample: true`.
- **demand_notices**: dn_no (unique), issue_date, payer_id, revenue_code, revenue_head (snapshot), period, basis_qty, rate_used (snapshot), fx_used (snapshot), amount_billed, payment_terms_days, due_date, cancelled (bool), cancelled_by, cancelled_at, cancel_reason, issued_by, remarks, is_sample, created_at.
- **receipts**: receipt_no (unique), receipt_date, payer_id, payer_name (snapshot), payer_category (snapshot), revenue_code, revenue_head (snapshot), revenue_category (snapshot), revenue_type (snapshot), budget_line_id (snapshot), dn_no (nullable FK), period, basis_qty, amount_due, amount_paid, channel, collecting_account, payment_ref, value_date, status (`Pending Confirmation`/`Confirmed`/`Reversed`), confirmed_by, confirmed_at, reversed_by, reversed_at, reverse_reason, recorded_by, created_at, remarks, is_sample.
  - **[IMPROVEMENT]** Snapshot the head, category, type and budget line at save time. Later edits to the Fee Schedule must not rewrite history.
- **bank_statement_totals**: financial_year, month (1–12), collecting_account, statement_total, entered_by, entered_at.
- **revenue_budget**: financial_year, budget_line_id, month (1–12), amount, source_note. Seed FY2026 from `seed/revenue_budget_fy2026.json` (Budget V2 phasing, total ₦3,330,525,875.87).
- **audit_log** (append-only): id, timestamp, user_id, user_name, action, reference, details (JSON).
  - Block UPDATE and DELETE at the database level with a trigger, or by revoking privileges from the app role.

**No hard deletes** of receipts, demand notices or payers. Use reversal, cancellation, or `active = false`.

---

## 4. Business rules (ported exactly from the workbook)

### 4.1 Numbering

- Receipt No = `{receipt_prefix}/{YEAR(receipt_date)}/{serial, 5 digits}`, e.g. `OGSERC/RCT/2026/00018`.
- DN No = `{dn_prefix}/{YEAR(issue_date)}/{serial, 4 digits}`, e.g. `OGSERC/DN/2026/0008`.
- Payer ID = `{payer_prefix}{serial, 4 digits}`, e.g. `OGS-P-0047`.
- Serials are never reused, even after a reversal or cancellation. The workbook used one running serial that admins reset manually.
  - **Open decision:** keep one serial, or reset it per year. The year is already in the number.
- Show the *next* number on the form as a preview. Assign the real number only on save.

### 4.2 Amount computation

This logic is shared by the New Receipt and New Demand Notice forms. Inputs are the fee head, the payer and the quantity (default 1).

1. **Effective rate**
   - If basis = `MW Band`: look up `licence_fee_bands` where `code = fee.code AND above_mw < MW AND up_to_mw >= MW`. MW is the payer's `capacity_mw` if it is above 0; otherwise use the quantity typed on the form.
     - If no band matches, the rate is 0. Show "⚠ No band rate for X MW, use Override".
   - Otherwise: `rate_ngn = published_rate × usd_ngn_rate` if currency is `USD`, else `published_rate`.
   - The rate is blank for the `MW Band` and `Variable` bases until computed.
2. **Computed amount by basis**
   - `Fixed`, `Per Unit`, `Per MW`, `% of Revenue`: rate × qty. For `% of Revenue`, the qty is the ₦ revenue base.
   - `Per Day`: `MIN(rate × qty, cap_ngn)` when cap_ngn > 0. Qty is days late.
   - `MW Band`: the band rate, if above 0.
   - `Variable`: no computed amount. An override is required.
3. **Override:** if an override amount is entered, it wins.
4. **Receipt form only:** if a DN is selected, amount due = that DN's current outstanding balance. This takes priority over the computed amount but not over the override.
5. **Receipt fallback:** if there is still no amount due, amount due = amount paid. This matches the VBA.
6. **Helper text:** the basis-specific helper text and the rate description are listed on the forms in the workbook, e.g. "₦45,000,000.00 for 25.0 MW (band rate) (US$ fee @ ₦1,500/US$)". Reproduce them.

**[IMPROVEMENT]** Store `rate_used`, `fx_used` and `basis_qty` on every DN and receipt.

### 4.3 Save receipt

Validation must reject the save and list every error.

- Receipt date is required and must be a valid date.
- Payer is required and must exist.
- Revenue head is required.
- Amount paid is required and must be above 0.
- Payment channel and collecting account are required.
- Payment ref / RRR is required. It must be unique, case-insensitive, among receipts whose status is not `Reversed`. Show "possible duplicate".
- If a DN is given:
  - it must exist,
  - it must belong to the same payer,
  - it must not be cancelled,
  - **[IMPROVEMENT]** its revenue code must equal the receipt's revenue code. Warn, and require a confirmation to proceed.
  - **[IMPROVEMENT]** Warn, but do not block, if the payment exceeds the DN's outstanding balance.
- `value_date` defaults to `receipt_date`.
- Status is `Pending Confirmation`, unless `auto_confirm` is on.
- Write the audit entry `Receipt recorded` with payer, code, amount and status.
- The form shows a live check line:
  - "Part payment – balance ₦X" when paid is less than due,
  - "Over-payment of ₦X" when paid is more than due,
  - "Payment matches amount due" otherwise.
- The buttons are **Save**, **Save & Print**, and **Clear**.

### 4.4 Confirm, reverse and cancel

- **Confirm** (Finance, bulk select on the Register): only `Pending Confirmation` rows change. Set confirmed_by and confirmed_at. Write an audit entry per receipt. Report "N confirmed, M skipped".
- **Reverse** (Finance, bulk): a reason is required. Rows that are not already Reversed become `Reversed`. Write an audit entry per receipt. Reversed rows stay visible, struck through, and are excluded from every total.
- **Cancel DN** (Finance, bulk): a reason is required. Set cancelled = true. Write an audit entry.
- **[IMPROVEMENT]** A Pending receipt can be edited by its recorder before confirmation, and every edit is audited. A Confirmed receipt can never be edited; it can only be reversed.

### 4.5 Demand notice derived fields

These are computed in SQL views or on read, never stored.

- `due_date = issue_date + payment_terms_days`.
- `paid_to_date` = sum of `amount_paid` on **Confirmed** receipts with `dn_no = this DN`.
- `outstanding` = 0 if cancelled, else `MAX(0, amount_billed − paid_to_date)`.
- `days_overdue` = `as_at − due_date` if outstanding > 0 and as_at > due_date, else 0.
- `aging_bucket`, checked in this order:
  1. `Cancelled` if cancelled,
  2. `Settled` if outstanding ≤ 0,
  3. `Not yet due` if days = 0,
  4. `1-30 days` up to 30,
  5. `31-60 days` up to 60,
  6. `61-90 days` up to 90,
  7. `Over 90 days` otherwise.
- `status`, checked in this order:
  1. `Cancelled`,
  2. `Paid` if outstanding ≤ 0,
  3. if paid > 0: `Part-paid (overdue)` when days > 0, else `Part-paid`,
  4. otherwise `Overdue` when days > 0, else `Unpaid`.
- `as_at` = `settings.as_at_date` or today, in Africa/Lagos.

### 4.6 Payer derived fields

- Total confirmed paid, all years.
- Total billed, excluding cancelled DNs.
- Outstanding: the sum of DN outstanding.
- Registration fee: the Schedule 3 fee for the payer's `sch3_category`.
- Registration paid: confirmed receipts for that payer with code `REG-{category}`.
- Registration status:
  - `Fee not set` if the fee is 0 or missing,
  - `Registered` if paid ≥ fee,
  - `Part-paid` if paid > 0,
  - `Not registered` otherwise.
- **Add Payer:** auto ID and a unique-name check, including a near-duplicate warning on normalised names. The near-duplicate warning is new **[IMPROVEMENT]**. Examples from the current data:
  - "CCETC TAIHU" vs "CCETC Taihu Distribution"
  - "Green Power Distribution Company" vs "GREEN POWER DISTRIBUTION NIGERIA LIMITED"

### 4.7 Revenue recognition

- Revenue counts **only Confirmed receipts**. Pending and Reversed receipts are excluded everywhere except the "Pending" KPIs.
- FY membership for revenue reports uses the **receipt date** year and month. This matches the workbook.
- Bank Recon uses the **value date**. This matches the workbook.
  - **Open decision:** whether revenue should also be recognised by value date.

### 4.8 Budget vs Actual

- Months elapsed:
  - 0 if YEAR(as_at) < FY,
  - 12 if YEAR(as_at) > FY,
  - otherwise MONTH(as_at).
  - **Open decision / [IMPROVEMENT]:** the workbook counts the current month as fully elapsed, so on 2 Nov it uses 11 months. Offer a setting for "completed months only" versus "including current month", defaulting to the workbook behaviour.
- Per budget line:
  - Budget FY.
  - Budget to date: the sum of monthly budget for months up to months elapsed.
  - Actual to date: confirmed receipts with that budget line, receipt year = FY, receipt month ≤ months elapsed.
  - Variance and achieved % against budget to date.
  - Actual FY, and % of FY budget.
- Line status, checked in this order:
  1. budget = 0 and actual > 0: `Unbudgeted receipts`,
  2. budget = 0: `No budget set`,
  3. budget to date = 0: `Not yet phased`,
  4. achieved ≥ 100%: `On / above budget`,
  5. achieved ≥ 75%: `Slightly behind`,
  6. otherwise `Behind budget`.
- Show a check: "Every receipt maps to a budget line".
- **[IMPROVEMENT]** Label the two percentages clearly, because the workbook's Home and Dashboard labels looked the same:
  - "Achieved vs budget to date" (3.91% on the sample data),
  - "Achieved vs full-year budget" (3.34% on the sample data).

### 4.9 Reports

- **Dashboard**, for FY = settings.financial_year:
  - Confirmed revenue (FY), split into IGR and Non-IGR.
  - Annual budget.
  - Achieved vs FY budget.
  - Pending confirmation: amount and count.
  - Outstanding DNs: amount and open count.
  - Overdue more than 90 days: amount and count.
  - Receipts recorded (FY): count, with the reversed count shown separately.
  - DN collection rate = paid_to_date ÷ billed, for non-cancelled DNs.
  - Charts: monthly collections vs phased budget, and category mix.
  - Top 5 payers (confirmed, FY).
  - DN ageing table with share %.
- **Monthly Summary:**
  - Revenue head × month matrix of confirmed revenue (FY).
  - Category subtotals, and an IGR vs Non-IGR split.
  - A phased budget row.
  - A reconciliation check that category totals equal head totals.
- **Arrears:** per payer, show billed, paid against notices, outstanding, the five ageing buckets, number of open notices and collection rate. Include an all-payers total row.
- **Bank Recon:**
  - A grid of month × collecting account.
  - "Per Register" = sum of amount_paid where status ≠ Reversed, by value_date year and month and by collecting account. This includes Pending receipts, by design, so Finance can match them.
  - "Per Statement" is entered by Finance.
  - Difference = statement − register. Highlight any non-zero difference.
  - Footer: "Pending receipts to confirm: N, ₦X".
- **Fee Schedule view:** collected FY per head, and share of FY.
- **Registration Fees page:**
  - Schedule 3 Part A and Part B tables, each with the payer count per category and the confirmed FY amount.
  - **Late registration calculator.** Inputs: category, deadline and assessment date. Outputs:
    - days late,
    - registration fee,
    - charge group,
    - initial charge,
    - daily charges = MIN(days × daily, cap),
    - total admin charges,
    - total payable.
    - Category I has no late charge.
    - Example: Cat F, 30 Jun to 31 Jul 2026 is 31 days late, giving ₦500,000 + ₦1,000,000 + ₦6,200,000 = ₦7,700,000.

### 4.10 Print documents

- **Official Receipt:**
  - Org name and address, receipt no, date, payer, licence no, revenue head and code, period, DN ref, amount (₦) and amount in words, channel, account, RRR, value date, recorded by and confirmed by.
  - A **PROVISIONAL** watermark until the receipt is confirmed.
  - A **REVERSED** watermark if it has been reversed.
- **Demand Notice:**
  - Org header, DN no, issue date, due date, payer and address, charge details, amount billed, paid to date, outstanding, and outstanding in words.
  - Payment instructions, late-payment note and signatory, all from settings.
- **Amount in words** (port of the VBA `AmountInWords`): `"<words> Naira, <words> Kobo Only"`. Omit kobo when 0. Use `"Zero Naira"` for 0. Round to 2 decimal places, and carry kobo = 100 into an extra naira.

### 4.11 Audit log

Write an entry for every state change:

- receipt recorded, edited, confirmed or reversed,
- DN issued or cancelled,
- payer added or edited,
- settings changed, including old and new values,
- fee head or rate changed, including old and new values,
- budget changed,
- user login and logout,
- exports.

The log page is filterable by user, action and date. It is read-only for everyone, including Admin.

---

## 5. Screens

The sidebar groups mirror the workbook's Home page:

- **Overview:** Dashboard.
- **Daily operations:** New Receipt, Register, New Demand Notice, Demand Notices, Payers.
- **Reports and control:** Monthly Summary, Budget vs Actual, Arrears, Bank Recon, Audit Log.
- **Budget, fees and registration:** Fee Schedule, Registration Fees, Licence Fee Tables, Revenue Budget.
- **Admin:** Settings and lists, Users, Data import and export.
- **Help:** a Guide page. Port the workbook's Guide text.

Register and Demand Notices tables need:

- server-side pagination, search and filters (status, date range, payer, head, account),
- a "Pending only" quick filter,
- multi-select bulk actions,
- export to .xlsx,
- red highlighting for duplicate refs, and strike-through for reversed rows.

Forms need searchable dropdowns for payer, fee head (label `"CODE — Head"`) and DN (only open DNs for the selected payer). They also need the live computed-amount panel and the live check line.

---

## 6. Import, export and sample data

- Write a seed script that loads `seed/*.json`.
  - A flag `--with-sample` also loads `sample_receipts.json`, `sample_demand_notices.json` and the 10 sample payers. Use it for dev and preview environments only.
  - **Production is seeded without sample data.** That replaces the workbook's "Clear Sample Data" button.
- After seeding, set the serials to:
  - receipt = 18, DN = 8, payer = 47 with samples,
  - receipt = 1, DN = 1, payer = 47 without samples, so the 36 real payer IDs are kept.
- Admins get an "Export everything" option that produces an .xlsx workbook of every table. This replaces Backup Copy.
- **[IMPROVEMENT]** Bulk import of payers from CSV, with a dry-run preview.

---

## 7. Hosting (Vercel Hobby), security and data protection

### 7.1 Hosting decision and its safeguards

The app runs on the Vercel Hobby plan. Hobby can pause a deployment (when a usage limit is hit, or if Vercel judges the usage commercial), so the app is built so that a pause is an inconvenience, never data loss:

- **Data lives outside Vercel.** The database is on Neon, in its own project. A paused Vercel deployment does not touch it.
- **Nightly off-platform backup.** A GitHub Actions workflow (`.github/workflows/backup.yml`) runs at 01:00 Africa/Lagos, does `pg_dump` of the production database using a repository secret `BACKUP_DATABASE_URL`, compresses and encrypts it (`gpg --symmetric` with secret `BACKUP_PASSPHRASE`), and uploads it as a workflow artifact kept for 90 days. The repo must be **private**.
- **In-app export.** Admin page "Export everything" downloads an .xlsx with every table. Finance should also download it weekly and keep it on an OGSERC drive.
- **No Vercel-only features.** Do not use Vercel KV, Blob, Edge Config, Vercel Postgres SDKs, `@vercel/*` runtime APIs or Vercel Cron. Use plain Next.js, plain Postgres (`DATABASE_URL`) and standard Node APIs, so `next build && next start` works on any host.
- **Keep requests short.** Hobby functions have tight time limits. Paginate tables server-side, page large exports, and never run a long job inside one request.
- **Neon free plan scales to zero** when idle, so the first request after a quiet period can take a few seconds. Show a skeleton loader, not a blank screen. Check Neon's current free-plan storage limit and note it in the README (this data is small: tens of thousands of rows at most).
- **One deployer.** Hobby allows one Vercel account. Kamiye's account owns the project; staff never need Vercel access because they log into the app itself.
- **Vercel's answer on file.** Post the plan to community.vercel.com (internal staff-only tool for a state regulator, built by an employee, no payments, no public users) and keep the reply in `docs/hosting-decision.md`. If Vercel says Pro is required, switch the plan; nothing in the code changes.
- **Region:** choose the Neon region and set the Vercel function region (`vercel.json → regions`) to the same or nearest region. Record both in the README.

### 7.2 Security

- Staff only. Every route requires auth. The only public route is `/sign-in`.
- HTTPS only, secure `httpOnly` cookies with this app's own cookie prefix (section 12), CSRF protection via server actions.
- Rate-limit sign-in in the database (attempts table), and lock an account for 15 minutes after 5 failed attempts. Do not depend on Vercel KV for this.
- Admin creates accounts with a one-time temporary password; the user must change it on first sign-in.
- Environment variables only: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `APP_ENV` (`development`/`preview`/`production`). Never commit secrets. `.env.local` is git-ignored.
- Preview deployments use a separate Neon branch seeded **with** sample data; production is seeded **without** it.
- This system holds licensees' financial data. Confirm the obligations under the **Nigeria Data Protection Act 2023** with OGSERC management or Legal, and record the hosting decision in `docs/hosting-decision.md`.

## 8. Known issues in the workbook (do not carry over)

1. The Home ("Budget achieved (FY to date)") and Dashboard ("BUDGET ACHIEVED (FY)") labels measure different things. See 4.8.
2. Budget to date counts the current month as complete. See 4.8.
3. A receipt against a DN did not check that the revenue code matched. See 4.3.
4. History depended on live Fee Schedule lookups. Use snapshots. See 3 and 4.2.
5. Finance segregation relied on a setting. Use roles. See 2.

Placeholders that Admin must fill in before go-live, through Settings and the Fee Schedule:

- office address,
- DN signatory,
- `[Bank 1]` / `[Bank 2]` account names,
- NCOA economic codes,
- Power Law section references,
- the FX rate policy,
- approval of the draft rates (`rate_status`).

---

## 9. Open policy decisions (for the Head of Finance)

1. Serial reset per year: yes or no.
2. Revenue recognition date: receipt date (current) or value date.
3. Budget-to-date rule: include the current month, or completed months only.
4. FX rate for USD fees: a fixed setting, the CBN rate on the billing date, or one entered per DN.
5. Whether a Finance Officer may confirm a receipt that another Finance Officer recorded.
6. Who approves rate changes, and whether a rate change needs a second approver.

---

## 10. Acceptance checks

Load the seed **with sample data** and set `as_at_date = 2026-11-02`, FY = 2026. The app must reproduce the workbook exactly:

| Figure | Expected |
|---|---|
| Confirmed revenue FY2026 | ₦111,100,000.00 (IGR ₦61,100,000 · Non-IGR ₦50,000,000) |
| Pending confirmation | ₦7,750,000.00 across 2 receipts |
| Receipts recorded (FY) | 16 shown on Dashboard (excludes reversed) + 1 reversed = 17 rows on Register |
| DNs billed (not cancelled) | ₦88,550,000.00 |
| DN outstanding | ₦31,050,000.00 across 4 open notices |
| Over 90 days | ₦31,000,000.00 across 3 notices; 31-60 days ₦50,000 |
| DN collection rate | 64.94% |
| Annual budget | ₦3,330,525,875.87 |
| Budget to date (11 months) | ₦2,838,653,215.12 |
| Achieved vs budget to date | 3.91% |
| Achieved vs FY budget | 3.34% |
| Top payer | Ogun State Government (Subvention) ₦50,000,000; then IBEDC ₦46,000,000; then EKEDC ₦10,000,000 |
| DN-0001 (IBEDC) | billed ₦60,000,000, paid ₦45,000,000, outstanding ₦15,000,000, 261 days, Part-paid (overdue) |
| Bank Recon, TSA – Remita, Feb | per register ₦41,000,000; TSA FY total ₦117,750,000 |
| Budget vs Actual BL-A2 | budget to date ₦2,344,119,881.78, actual ₦55,000,000, Behind budget |
| Amount calc: EMG-01, payer 1.5 MW | ₦50,000 (band rate) |
| Amount calc: GEN-02, payer 25 MW | ₦45,000,000 (US$30,000 @ ₦1,500) |
| Late reg calc: Cat F, 31 days | ₦7,700,000 total payable |

Also write automated tests (Vitest) for the following, and run them in CI:

- the amount computation,
- DN status and bucket logic,
- amount in words, including `1,000,000.50` → "One Million Naira, Fifty Kobo Only",
- duplicate-ref blocking,
- the self-confirmation block.

---

## 11. Build phases

1. **Foundation and design system:** create the repo (section 12 rules), Tailwind tokens, theme toggle, app shell (sidebar, top bar, user card) and sign-in page exactly as `DESIGN.md` describes, Auth.js with roles, DB schema and migrations, seed script, Settings and lists admin, Users admin, change password, Audit log write helper and Audit log page.
2. **Masters:** Payers (with the near-duplicate check), Fee Schedule, Schedule 3 tables with the late-registration calculator, Licence Fee Tables, Revenue Budget editor.
3. **Billing:** New Demand Notice (amount engine), Demand Notices register, cancel, DN print and PDF.
4. **Receipts:** New Receipt, Register with filters, confirm and reverse, receipt print and PDF, amount in words.
5. **Reports:** Dashboard (with the signature revenue card from `DESIGN.md`), Budget vs Actual, Monthly Summary, Arrears, Bank Recon, Excel exports. Run the section 10 acceptance checks.
6. **Hardening and deploy (Hobby):**
   - Vitest tests and a GitHub Actions CI workflow (lint, typecheck, test) on every push,
   - the nightly backup workflow (section 7.1),
   - a new Vercel project linked to this repo only, a new Neon production database, environment variables,
   - production seed without samples, first Admin user created from a one-off script,
   - the Guide page and a README that records region, Neon limits and how to restore a backup.

---

## 12. Standalone project: no clash with other OGSERC apps

This app must share nothing with the Registry app, the Registration & Evaluation (EVAL-01) app, the OGSERC website or the ERP work.

| Thing | Rule for this app |
|---|---|
| Folder and repo | New folder and new **private** GitHub repo `ogserc-revenue-register`. Not a monorepo, not a package inside another repo, no git submodules |
| Code sharing | Copy nothing from the other repos and import nothing from them. No shared npm packages. If a pattern is useful, rewrite it here |
| Database | Its own Neon project and database (`ogserc_revenue`). Never point at another app's database or branch |
| Vercel | Its own Vercel project, named `ogserc-revenue-register`, with its own environment variables |
| URL | Its own subdomain, e.g. `ogserc-revenue-register.vercel.app` (or a custom `revenue.` subdomain later) |
| Auth | Its own `users` table and its own `AUTH_SECRET`. Staff get separate accounts here. No single sign-on with the other apps |
| Cookies and storage | Cookie names prefixed `ogsrr_` (e.g. `ogsrr.session-token`); any `localStorage` keys prefixed `ogsrr:`. Prevents session clashes when apps run on `localhost` side by side |
| Local dev port | `3100` (`next dev -p 3100`) so it can run next to the other apps, which use the default 3000 |
| Number formats | Only this app's prefixes: `OGSERC/RCT/…`, `OGSERC/DN/…`, `OGS-P-…`. Do not reuse the other apps' ACK or reference formats |
| App identity | Product name "Revenue Register", tagline "Receipts, billing & collections". Distinct look from the Registry app (gold-on-emerald signature, see `DESIGN.md`) so staff can tell the apps apart at a glance |
| Claude Code | Start every session inside this repo folder. Claude Code must not read or change files outside it (also stated in `CLAUDE.md`) |
