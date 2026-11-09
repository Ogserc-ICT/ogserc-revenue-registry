# Progress

## Phase 1: Foundation and design system (complete, awaiting review)

Completed 2 Nov 2026.

### What was built

**Project**
- Next.js 16.4 (App Router, Turbopack), React 19, TypeScript strict (`noUncheckedIndexedAccess` on), Tailwind CSS 4, pnpm.
- `pnpm dev` runs on port 3100. `pnpm build && pnpm start` works; nothing Vercel-specific is used.
- Drizzle ORM with postgres.js, connected only through `DATABASE_URL`. SQL migrations are committed in `src/db/migrations`.

**Design system** (`src/app/globals.css`)
- Every DESIGN.md colour token is a CSS variable: light values on `:root`, dark on `.dark`. Tailwind maps them through `@theme inline`, so components use `bg-surface`, `text-muted` and so on. Components contain no raw hex.
- Only the four DESIGN.md gradients exist. The page glow is fixed behind the app.
- Type scale, radius hierarchy (18 / 14 / 10 / 999), focus ring with glow, skeleton shimmer.
- `prefers-reduced-motion` sets all CSS durations to 0, and `MotionConfig reducedMotion="user"` turns off motion animations.
- Geist Sans is self-hosted via the `geist` package (next/font/local).
- Theme: dark by default, light toggle via next-themes, stored in `localStorage` key `ogsrr:theme`.

**App shell** (`src/components/shell`)
- Sidebar: 264px; an icon rail from 768 to 1023px; a slide-over sheet below 768px.
  - It has the logo, "Revenue Register" and the tagline.
  - Groups are filtered by role.
  - The brand pill slides between items (motion `layoutId`, 250ms spring, no bounce).
  - The user card shows the initial, name, role, Change password and Sign out.
- Top bar:
  - page name;
  - FY chip: a per-user view preference in the `ogsrr.fy` cookie, listing years that have a budget or receipts;
  - "As at" date;
  - amber pending badge with a live count, Admin and Finance Officer only, linking to `/register?status=pending`;
  - theme toggle.
- Sixteen placeholder pages for later phases. Each is role-gated like the real page and shows a one-line empty state.

**Auth** (`src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`)
- Auth.js v5 Credentials (email + password), bcrypt cost 12, JWT sessions that expire after 30 minutes idle.
- Cookie names `ogsrr.session-token`, `ogsrr.csrf-token` and `ogsrr.callback-url`. They get `__Secure-`/`__Host-` prefixes when `AUTH_URL` is https.
- Roles: Admin, Revenue Officer, Finance Officer, Viewer. A user can hold several.
- Permissions live in a capability map (`src/lib/permissions.ts`).
  - Every page checks it through `gatePage()`, and every server action through `requireAction()`.
  - Both re-read the user from the database, so deactivation and role changes apply on the next request.
- Forced password change on first sign-in, and after an Admin resets a password.
  - The proxy does an optimistic redirect; pages and actions enforce it.
- Sign-in, sign-out and password changes are audited. Every attempt is written to `sign_in_attempts`; the lockout itself comes in Phase 6.

**Database** (all BUILD_SPEC section 3 tables, created now)
- `users`, `sign_in_attempts`, `settings` (single row, enforced by a check constraint), `serials`, `lists`, `budget_lines`, `fee_heads`, `sch3_registration_fees`, `sch3_late_charges`, `licence_fee_bands`, `payers`, `demand_notices`, `receipts`, `bank_statement_totals`, `revenue_budget`, `audit_log`.
- Triggers:
  - `audit_log` rejects UPDATE, DELETE and TRUNCATE.
  - `receipts`, `demand_notices` and `payers` reject DELETE.
- `demand_notices.due_date` is a generated column (`issue_date + payment_terms_days`). It is stored as section 3 lists, but it can never drift, as section 4.5 requires.
- Receipts keep snapshots of payer, head, category, type and budget line. There is a partial unique index on `lower(payment_ref)` where the status is not Reversed, as a backstop for the duplicate-RRR rule.

**Domain helpers** (`src/lib`)
- `numbering.ts`:
  - Number formats.
  - `allocateSerial()`: an atomic upsert inside the caller's transaction.
  - `peekSerial()`: the preview.
  - `raiseSerial()`: raise-only, with the row locked.
- `audit.ts`: `writeAudit(tx, …)` writes in the same transaction; `diffFields()` produces old/new values.
- `dates.ts` (Africa/Lagos), `money.ts` (decimal.js formatting), `validation.ts` (Zod schemas), `password.ts`, `roles.ts`, `nav.ts`, `lists.ts`.

**Scripts**
- `pnpm db:migrate`
- `pnpm seed [--with-sample]`
  - It is idempotent: existing rows are never overwritten and serials are only ever raised.
  - It refuses `--with-sample` when `APP_ENV=production`.
- `pnpm create-admin`: interactive, masked password. Leave the password blank to get a temporary one.
- `pnpm screens`: Playwright screenshots of every screen, dark and light, at 375px and 1440px. It also reports browser errors and horizontal overflow.

**Admin screens**
- **Settings & lists** (`/admin/settings`), with three tabs:
  - Settings: every settings field. Each save writes one audit entry with old and new values for the changed fields only.
  - Serial numbers: the next-number preview, plus a raise-only dialog that is audited.
  - Dropdown lists: the 7 editable lists. Values can be added (with a case-insensitive duplicate check), reordered, deactivated or reactivated. Every change is audited.
- **Users** (`/admin/users`):
  - Create a user with roles. A one-time temporary password is shown once, with a copy button.
  - Edit roles, reset the password (a new temporary password), deactivate or reactivate.
  - You cannot change your own roles, deactivate yourself, or remove the last active Admin.
- **Change password** (`/change-password`): the minimum is 10 characters, and the new password must differ from the current one.
- **Audit log** (`/audit-log`):
  - Read-only. Admin and Finance Officer only.
  - Filters: user (including "System"), action, date range (Lagos days) and text search.
  - 50 per page, rendered on the server. Details expand to show changes as old → new.

### Checks run
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass (27 tests) and `pnpm build` succeeds.
- Tests run on PGlite (in-process Postgres) with the real migrations. They cover:
  - seed counts: 78 fee heads, 76 bands, 46 payers, 7 DNs, 17 receipts;
  - budget precision: FY total ₦3,330,525,875.87, 11-month total ₦2,838,653,215.12;
  - serial rules: concurrency, rollback, raise-only;
  - the audit triggers and the no-hard-delete triggers;
  - audit entries rolling back with their transaction;
  - payment-ref uniqueness;
  - permissions, the password policy, settings validation and the Lagos-date helpers.
- Browser checks against the Neon dev database, run with Playwright scripts:
  - Sign-in: wrong password, then the temporary password.
  - Forced change: other pages redirect to it, and passwords under 10 characters are rejected.
  - Sign-out.
  - Settings: an edit reaches the audit log with old and new values; an invalid value keeps what was typed.
  - Lists: a duplicate list value is rejected.
  - Serials: lowering is refused.
  - Users: a Viewer created through the UI sees the Register but not the Audit log, the Admin pages or New receipt, and has no pending badge.
  - Deactivation: a deactivated user is signed out on their next request.
- `pnpm screens`: all 36 combinations of 9 screens × 2 themes × 2 widths have no browser errors and no horizontal overflow. The mobile slide-over and the tablet icon rail were checked separately.

### Decisions
| Decision | Why |
|---|---|
| Serials: one running serial, never reset (`serials.year = 0`) | Agreed default (open decision 1). The schema already supports per-year serials. |
| Admin can raise a serial but never lower it; each raise is confirmed and audited | Agreed. Lowering would reuse numbers. |
| `revenue_budget.amount` is `NUMERIC(20,6)` | Agreed. Rounding each month to 2 dp gives ₦…875.92 and ₦…215.16, not the workbook's .87 and .12. |
| Rates and FX (`published_rate`, `rate_used`, `fx_used`, `usd_ngn_rate`) are `NUMERIC(18,6)` | The levy rates are 0.015. All money amounts stay `NUMERIC(18,2)`. |
| `licence_fee_bands.published_rate` is nullable (migration 0002) | Three source bands, "201 - 400 MW (no rate in source)" for EMG-01/02/03, have no rate. Phase 3 will treat them as "no band rate, use Override". |
| Viewers can see the Register; the Audit log is Admin + Finance Officer | Agreed. |
| Password minimum is 10 characters | Agreed. |
| Budget-to-date rule is a setting, defaulting to "include the current month" | BUILD_SPEC 4.8 default (workbook behaviour). |
| The seed sets `as_at_date = 2026-11-02` only with `--with-sample`; production gets null (today) | Otherwise production reports would be frozen on the workbook's date. |
| Seeded sample receipts and DNs store the workbook's text names ("Revenue Officer (SAMPLE)") with null user IDs | Every actor column has both a text snapshot and a nullable user FK. The self-confirmation block (Phase 4) compares IDs. |
| The reversed sample receipt's `reversed_at` and `reverse_reason` are parsed from its remarks | The workbook only kept the reversal there ("REVERSED 12-Sep-2026: wrong revenue head"). |
| The workbook's "Show confirmation prompts" setting was dropped | Bulk actions will always ask for confirmation. |
| List values can't be renamed: deactivate the old one and add a new one | History stores the text, so a rename would make old records disagree with the list. |
| Light-mode status *text* colours are darkened from the same token with `color-mix` | DESIGN.md 7 requires WCAG AA. Bright rose, amber and emerald on white fail AA. DESIGN.md's own gold → gold-700 rule is kept. |
| Sidebar group labels follow DESIGN.md ("Daily work", "Fees & budget"), plus "Help" | DESIGN.md is the source of truth for UI. |
| Emblem `public/brand/ogserc-mark.png` is cropped from the official logo, with a white inner disc | The logo's centre is transparent, so the map vanished on dark surfaces. The full wordmark is kept as `ogserc-wordmark.png`. |
| Forms submit via `onSubmit` (`useFormAction`) rather than `<form action>` | React 19 resets `<form action>` forms after every submit, which wiped input when the server returned an error. |
| `forbidden()` is not used; pages render a "no access" state instead | It is still experimental in Next 16. |
| Next's auto-generated `AGENTS.md` is turned off (`agentRules: false`) | CLAUDE.md is the rules file. |

### Notes for the reviewer
- A test Admin, `qa.admin@ogsrr.test`, exists in the dev database, along with a deactivated `qa.viewer@ogsrr.test`. Both were created during the browser checks. Deactivate the Admin once you have created your own with `pnpm create-admin`.
- The dev database is seeded **with** sample data.
- The "N" badge in the bottom-left corner of dev screenshots is Next's development indicator. It does not appear in production builds.

### What's next
Phase 2 (Masters) has been built; see the Phase 2 section above. Phase 3 (Billing) follows review.

### Open policy decisions still with the Head of Finance (BUILD_SPEC 9)
- 2: revenue recognition date (receipt date for now).
- 4: FX policy (fixed setting for now).
- 5: whether one Finance Officer may confirm a receipt another recorded.

## Phase 3: Billing (complete, awaiting review)

Built 9 Nov 2026.

### Source material
The workbook (`OGSERC_Revenue_Register_FMS_v2.xlsm`, git-ignored) is now in the folder. Its New Demand Notice and DN Print formulas and its VBA module `modRevenue` were read with throwaway scripts (stdlib zip and OLE readers, nothing installed) so the rules below are ported word for word rather than paraphrased. Its Guide sheet is the text Phase 6 needs.

### What was built

**Amount engine** (`src/lib/amount.ts`, BUILD_SPEC 4.2), shared by the form and the server:
- Effective rate: MW Band looks up `above_mw < MW <= up_to_mw` on the payer's capacity (else the quantity); US$ rates × the Settings FX.
- Computed amount: rate × quantity; MW Band = the band rate; Variable = none. Any head with a cap is capped (the workbook applies the cap to every basis, not only Per Day).
- Override wins. Receipt-only rules (DN balance, then amount paid) are in `receiptAmountDue()` for Phase 4.
- The rate line, quantity hint and form status are the workbook's text, e.g. "₦45,000,000.00 for 25.0 MW (band rate)  (US$ fee @ ₦1,500/US$)" and "⚠ No band rate for 300.0 MW - use Override".

**Demand notice derived fields** (`src/lib/demandNotice.ts`, BUILD_SPEC 4.5): outstanding, days overdue, ageing bucket and status, in the spec's order. The same rules are in SQL in `dn-service.ts` so the register can filter and page on them; a test checks the two agree on every notice.

**Amount in words** (`src/lib/words.ts`): a line-for-line port of the VBA `AmountInWords`. "and" only inside a hundreds group ("One Hundred and Five", "One Thousand Twenty-One"), hyphenated tens, ", … Kobo", always "… Only", "Zero Naira Only".

**New demand notice** (`/new-demand-notice`)
- Searchable payer and fee head pickers (`Combobox`, keyboard accessible; fee heads labelled "CODE — Head").
- Live calculation panel (next DN number, payer capacity and revenue base, rate line, computed amount, override, amount billed, due date, status line). One-click "Use 25 MW" / "Use ₦…" where the workbook's hint suggests the payer's figure.
- Issue, Issue & print, Clear. The server recomputes the amount from the fee schedule, bands and FX (the browser's figure is only a preview), allocates the DN serial in the same transaction as the insert and the audit entry, and stores the head, payer name, rate used, FX used and quantity.
- Inactive payers and heads are refused. "Issue demand notice" on a payer's page opens the form with that payer.

**Demand notices register** (`/demand-notices`)
- Server-side search (notice no., payer), filters (status, open, ageing, payer, head, issue dates), quick filters (All, Open only, Over 90 days) and pagination.
- Totals for everything matching: billed (not cancelled), paid against notices, outstanding with open count, collection rate.
- Finance/Admin: multi-select (emerald left edge), bulk action bar sliding up (200 ms), cancel with a required reason. Already-cancelled notices are skipped, as in the workbook; one audit entry per notice.

**Notice page** (`/demand-notices/[id]`): figures, details (including rate, FX and quantity used), cancellation details, receipts against the notice, and Print, PDF and Cancel.

**Print and PDF** (`/print/demand-notices/[id]`, `/print/demand-notices/[id]/pdf`)
- Laid out like the workbook's DN Print sheet: org header, banner ("*** CANCELLED - NOT VALID ***" / "SETTLED - NO BALANCE OUTSTANDING"), RE: line, charge table, less paid, amount outstanding, outstanding in words (blank when nothing is outstanding), due date, days overdue, payment instructions, late note, signatory.
- A4 portrait, always light (`.paper` re-applies the light tokens inside dark mode), no gradients. The PDF is built on the server with `@react-pdf/renderer` 4.3.0 and needs the same access as viewing the notice.

### Checks run
- `pnpm lint`, `pnpm typecheck`: clean. `pnpm test`: 86 pass (27 new). `pnpm build`: succeeds.
- BUILD_SPEC 10 figures reproduced by tests on the sample seed (as at 2 Nov 2026): DNs billed ₦88,550,000.00; outstanding ₦31,050,000.00 across 4 open notices; over 90 days ₦31,000,000.00 across 3; 31-60 days ₦50,000.00; DN collection rate 64.94%; DN-0001 billed 60m, paid 45m, outstanding 15m, 261 days, Part-paid (overdue); EMG-01 at 1.5 MW = ₦50,000; GEN-02 at 25 MW = ₦45,000,000 (and stored with FX 1,500 and quantity 25).
- Issue: a failed issue doesn't use up a DN number; Variable heads need an override; the override and the computed amount are both audited.
- PDF rendered from the dev database and inspected (DN-0001).
- `pnpm screens`: all 84 combinations (21 screens × 2 themes × 2 widths) have no browser errors and no horizontal overflow.
- Browser click-through (every check passes, run twice, no page errors), with **no changes to the dev data** at the owner's request: nothing was issued or cancelled. Demand notice count, cancelled count, DN serial and demand-notice audit entries were recorded before and after and are identical.
  - Form: status line in the workbook's order; Issue disabled until ready; searchable payer and "CODE — Head" pickers; GEN-02 at 25 MW = ₦45,000,000.00 with the workbook's rate text; EMG-01 at 1.5 MW = ₦50,000.00; EMG-01 at 300 MW asks for an override; LRC-04 31 days = ₦6,200,000.00 and 200 days capped at ₦20,000,000.00; Variable heads need an override; Clear; next number OGSERC/DN/2026/0008.
  - Register: billed, outstanding, 4 open, 64.94%; DN-0001 Part-paid (overdue), 261 days; Over 90 days = 3 notices, ₦31,000,000.00; bulk bar; cancel refused without a reason.
  - Notice page, print page (sheet stays white in dark mode), PDF download (`application/pdf`, `OGSERC-DN-2026-0001.pdf`), and the payer page's "Issue demand notice" shortcut.
  - Viewer: no access to the demand notice pages, PDF refused with 403, sidebar hides them.
- Found and fixed during the browser pass:
  - the register's Status and Due columns ran off the right edge at 1440px: Paid now sits under Billed;
  - the comboboxes' × buttons were also named "Clear", like the form's Clear button: renamed "Clear selection";
  - an empty cancel reason now gets an instant answer in the browser (the server still checks);
  - `scripts/screens.ts` waits up to 2 minutes for a page, for slow first compiles on the dev server.
- The browser checks ran against `pnpm build && pnpm start`: the dev machine had about 400 MB of free memory, and on-demand compiling in `pnpm dev` took minutes per page. The QA accounts were reactivated by the owner for the checks and deactivated again afterwards (audited).

### Decisions
| Decision | Why |
|---|---|
| The cap applies to any head with a cap, not only Per Day | Workbook formula C27; BUILD_SPEC 4.2 described the Per Day case. No seeded head outside Per Day has a cap today. |
| A head with no rate set shows "⚠ Rate not set - use Override" | The workbook showed "₦0.00 …", which hid why nothing was computed. Same behaviour: an override is required. |
| The PDF labels amounts "NGN" | The PDF fonts (Helvetica, and Geist) have no ₦ glyph; the printable HTML page shows ₦. Embedding a font with ₦ is possible later. |
| Excel export of the register is left for Phase 5 | Phase 5 lists "Excel exports"; one export mechanism for all registers and reports. |
| Printing and PDF downloads aren't audited | BUILD_SPEC 4.11 audits state changes and exports; a print changes nothing. The Phase 5 Excel exports will be audited. |
| `@react-pdf/renderer` pinned at 4.3.0 | Known-good with React 19. |

### Notes
- Install packages only with the dev server stopped. Adding the PDF library while it ran left `node_modules` half-linked on Windows, which broke `pnpm build` with "Cannot read properties of null (reading 'useContext')". A clean `pnpm install --frozen-lockfile` fixed it.

## Phase 2: Masters (complete, awaiting review)

Built 5 Nov 2026.

### What was built

**Payers** (`/payers`, `/payers/new`, `/payers/[id]`, `/payers/[id]/edit`)
- List with server-side search (name, payer ID, licence no.), filters (category, Schedule 3 category, registration status, active/inactive/all) and pagination (25 a page). The total comes from a `count(*) over ()` column, so each page is one query.
- Derived figures per BUILD_SPEC 4.6, computed on read in SQL: confirmed paid (all years), billed (not cancelled), outstanding (per-notice `MAX(0, billed − confirmed paid)`), open notices, Schedule 3 fee, registration paid (`REG-{category}`) and registration status.
- Add and edit share one form. The payer ID is allocated with `allocateSerial` in the same transaction as the insert and the audit entry; the form previews the next ID.
- Name checks (`src/lib/payer-names.ts`): an exact case-insensitive match is blocked (the unique index is the backstop, and a concurrent duplicate gets a friendly message). A near match warns and lists the similar payers; the officer must press "It's a different payer" to save, and the audit entry records the names they confirmed.
- Category, licence status and LGA must be active list values; a value that was later deactivated is kept on edit.
- Edits audit only changed fields, old → new. Payers are deactivated (Active tick box), never deleted.
- Detail page: the four figures, every field, and the latest 10 notices and receipts.

**Fee schedule** (`/fee-schedule`, `/fee-schedule/new`, `/fee-schedule/[code]/edit`)
- All heads grouped by category, with a rate description (`describeRate`), basis, frequency, rate status, type and budget line, and confirmed FY collected per head with share of FY (receipt date, FY chip year).
- Admin can add and edit heads. Codes can't change. The form shows only the fields that fit the basis (rate hidden for MW Band and Variable, cap only for Per Day). % of Revenue rates are typed as a percentage and stored as a fraction (1.5 → 0.015).
- Every change is audited with old and new values. Receipts and notices keep their own snapshots, so history is not rewritten.

**Registration fees** (`/registration-fees`)
- Schedule 3 Part A and Part B tables with active payer counts and confirmed FY amounts.
- Late registration calculator (`lateRegistration` in `src/lib/registration.ts`): days late, fee, charge group, initial charge, daily charges = MIN(days × daily, cap), total admin charges, total payable. Category I has no late charge.
- Admin can edit a Part A fee or a Part B group. The save copies the amounts into the linked REG/LRC fee heads in the same transaction, with one audit entry.

**Licence fee tables** (`/licence-fee-tables`)
- The 76 bands grouped by fee code, with a picker per code, the naira equivalent of US$ bands at the Settings rate, and "No rate: use an override" for bands without one.
- Admin can edit or clear a band rate, audited.

**Revenue budget** (`/revenue-budget`)
- Lines × months for the FY chip year, grouped A–D with subtotals, monthly totals and the FY total.
- Admin edits one line at a time in a dialog with a live total. Only months whose 2 dp value changed are written, so the workbook's full-precision figures (and the ₦3,330,525,875.87 total) stay exact. `?fy=` opens a year with no budget yet (the "FY2027 budget" button).

**Shared**
- Domain logic in `src/lib`: `payer-names.ts`, `registration.ts`, `budget.ts` (including `monthsElapsed` for Phase 5), `fees.ts` (pure); `payers-service.ts` and `fees-service.ts` (database work, taking the `Db` so tests run them on PGlite).
- New audit actions: Fee head added, Schedule 3 rate changed, Licence fee band changed (Payer added/edited, Fee head changed and Budget changed already existed).
- `ActionAuthError` moved into `action-result.ts` (re-exported from `session.ts`), so services can use the error types without importing `server-only`.
- `useFormAction` now sends the pressed submit button's name and value.

### Checks run
- `pnpm lint`, `pnpm typecheck`: clean. `pnpm test`: 59 pass (32 new). `pnpm build`: succeeds, all routes compile (run before the last three UI fixes below, which typecheck and lint clean).
- Unit tests: the kickoff checks (Cat F, 30 Jun → 31 Jul 2026 = 31 days, ₦7,700,000; "CCETC Taihu Distribution Ltd" warns about "CCETC TAIHU"), both BUILD_SPEC 4.6 name examples, cap and Category I rules, registration status order, rate descriptions, budget parsing and change detection, months elapsed.
- Database tests on the sample seed: payer totals match the workbook (billed ₦88,550,000.00; outstanding ₦31,050,000.00 across 4 open notices; confirmed ₦111,100,000.00); IBEDC and Ogun State Government figures; registration filter; search and paging; payer add (OGS-P-0047, audited, near-duplicate confirm recorded); list validation; edit audit and deactivation; rename to an existing name refused; fee head audit; Schedule 3 heads keep their rate; Schedule 3 copy-through; band rate edit; budget saves only changed months and keeps the FY total exact; a new year's budget.
- `pnpm screens`: all 72 combinations (18 screens × 2 themes × 2 widths) have no browser errors and no horizontal overflow.
- Browser click-through against the dev database (24 checks, all pass), with no lasting data changes:
  - calculator: Cat F, 30 Jun → 31 Jul 2026 shows 31 days and ₦7,700,000.00;
  - "CCETC Taihu Distribution Ltd" shows the Possible duplicate warning and saves nothing until confirmed; "ccetc taihu" is blocked on the name field;
  - payer detail: DN-0001 paid ₦45,000,000.00;
  - unchanged saves on payer, fee head, budget line and Schedule 3 forms report "No changes to save";
  - REG-F rate locked; LEV-01 rate shown as 1.5 (%); GEN-02 11–50 MW US$30,000 = ₦45,000,000.00; budget line and FY totals exact;
  - as a Viewer: Payers and the editors show no access, and no Edit or Add buttons appear.
- Found and fixed during the browser pass:
  - payer detail: each notice's Paid showed the payer's total confirmed against all notices (a correlated subquery lost its table names). Now a joined subquery in `listPayerNotices`, with a test for DN-0001;
  - Fee schedule at 375px: long rate status pills overflowed; `StatusPill` has a `wrap` option for long free-text statuses;
  - Revenue budget dialog total summed the 2 dp cells and drifted by kobo; it now uses the stored figure for untouched months, as the save does. The line's FY total and Edit button now sit next to its name, so they stay in view while months scroll sideways;
  - Registration fees: the Code column no longer wraps.
- The Phase 1 QA accounts were reactivated with new passwords for these checks and deactivated again afterwards (both audited).

### Decisions
| Decision | Why |
|---|---|
| Schedule 3 is the source for the REG-A..K and LRC-01..06 rates. They are edited on Registration fees and copied into the fee heads on save; in the fee head editor their basis, currency, rate and cap are locked | BUILD_SPEC 3 allows linking or copying; copying keeps the amount engine simple, and locking stops the two from disagreeing. |
| Near-duplicate rule: same words after removing case, punctuation and words like Limited/Ltd/Plc/Nigeria/Company; or every word of a 2+ word name inside the other; or one or two letters apart | Flags both BUILD_SPEC examples and only 3 other pairs in the seed, all CCETC TAIHU variants. It only warns, so a false alarm costs one click. |
| Payer category, licence status and LGA are checked against the active list values on the server | CLAUDE.md rule 10: the dropdown alone is not validation. |
| Registration status pills: Registered emerald, Part-paid gold, Not registered muted, Fee not set slate | DESIGN.md doesn't list these; chosen to match the demand notice colours (Paid emerald, Part-paid gold). |
| The late calculator's deadline starts blank and the assessment date starts at the as-at date | The spec gives no default deadline; a guessed one could be mistaken for the statutory date. |
| Fee schedule shares are of total confirmed FY revenue by receipt date | BUILD_SPEC 4.7 and 4.9. |

## Pre-Phase 2 housekeeping (5 Nov 2026)

### Decisions
| Decision | Why |
|---|---|
| Rate changes (open decision 6): an Admin edits fee head rates directly, with no second approver. Every change is audited with old and new values | Agreed. A second-approver step can be added later without changing the data model. |
| The repo and folder keep the name `ogserc-revenue-registry`, although BUILD_SPEC 12 says `ogserc-revenue-register` | Agreed. The package name, product name and number formats are unchanged. The Vercel project name is decided in Phase 6. |
| The Neon dev database is named `neondb` (Neon's default). The production database will be created as `ogserc_revenue` in Phase 6 | The dev database is already in its own Neon project, which is what BUILD_SPEC 12 requires. |

### Environment
- Local secrets live in `.env.local`, which the scripts and `drizzle.config.ts` load. A file named `.env` is not read by `pnpm db:migrate`, `pnpm seed` or `pnpm create-admin`.
- A temporary Admin (`rev@oserc.com`) was created with `pnpm create-admin` and has signed in. It is a test account: once the owner creates the proper Admin, deactivate it (users are deactivated, not deleted, so the audit history keeps its link). The Phase 1 test Admin `qa.admin@ogsrr.test` is now deactivated (audited as "User deactivated"), so the dev database has one active user.
- `corepack enable` was run on the dev machine, so `pnpm` (10.11.0, from `packageManager`) is on PATH.
- Checked: lint, typecheck and the 27 tests pass; migrations are up to date on the dev database; the dev server serves `/sign-in` and redirects signed-out requests to it.
