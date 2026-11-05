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

### What's next: Phase 2 (Masters)
- Payers list, add and edit, with the near-duplicate name warning (BUILD_SPEC 4.6). It uses `allocateSerial(tx, "payer")`.
- Fee Schedule view and editor (Admin), with old/new audit.
- Registration Fees: the Schedule 3 Part A and Part B tables, and the late registration calculator (Cat F, 30 Jun → 31 Jul 2026 = ₦7,700,000).
- Licence Fee Tables.
- Revenue Budget editor.

### Open policy decisions still with the Head of Finance (BUILD_SPEC 9)
- 2: revenue recognition date (receipt date for now).
- 4: FX policy (fixed setting for now).
- 5: whether one Finance Officer may confirm a receipt another recorded.

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
