# CLAUDE.md — OGSERC Revenue Register

## What this project is

A staff-only web app that replaces the `OGSERC_Revenue_Register_FMS_v2.xlsm` workbook. Revenue officers record receipts and issue demand notices. Finance confirms receipts against the bank or TSA statement. Management reads the reports.

- `BUILD_SPEC.md`: what to build and the exact business rules. This is the source of truth for logic.
- `DESIGN.md`: how it must look and move. This is the source of truth for UI.
- `seed/`: reference data extracted from the workbook.
- `docs/PROGRESS.md`: keep this updated at the end of every phase. Record what was built, what's left, and any decisions made.

## Hard rules

1. **This repo is standalone.** Never read, copy from, import from, or modify anything outside this folder. That includes the other OGSERC projects (Registry, Registration & Evaluation, website, ERP), even if they sit nearby on disk. Follow BUILD_SPEC.md section 12.
2. **Build one phase at a time** (BUILD_SPEC.md section 11). Stop at the end of the phase, summarise what was done, and wait for review.
3. **Money is never a float.** Use `NUMERIC(18,2)` in Postgres and `decimal.js` in TypeScript.
4. **All business dates use `Africa/Lagos`.**
5. **Every state change writes to `audit_log` in the same transaction.** The audit log is append-only.
6. **Serial numbers are allocated atomically** in the same transaction as the insert. Numbers are never reused.
7. **No hard deletes** of receipts, demand notices or payers.
8. **No Vercel-only features**: no KV, Blob, Edge Config, Vercel Postgres SDK, Vercel Cron or `@vercel/*` runtime APIs. Use plain Next.js and plain Postgres via `DATABASE_URL`. `next build && next start` must work on any host.
9. **Production is never seeded with sample data.** Seed it with `pnpm seed` (no flag). Use `pnpm seed --with-sample` for dev and preview only.
10. **Server-side checks for everything.** Validate inputs with Zod and check the user's role in each server action. The UI hiding a button is not security.
11. **Follow DESIGN.md tokens.** No raw hex in components. Respect `prefers-reduced-motion`. Gradients appear only where DESIGN.md allows them.
12. **When the spec is unclear, ask.** Do not invent a business rule. Where an open decision has a stated default (BUILD_SPEC.md section 9), use that default and note it in `docs/PROGRESS.md`.

## Conventions

- Next.js App Router, TypeScript strict mode, server actions for mutations, server components by default.
- Use pnpm. Run the dev server on **port 3100**: `pnpm dev` runs `next dev -p 3100`.
- Cookie names are prefixed `ogsrr`, and any `localStorage` keys are prefixed `ogsrr:`.
- Folders: `src/app` (routes), `src/components`, `src/lib` (domain logic: `amount.ts`, `demandNotice.ts`, `words.ts`, `numbering.ts`, `budget.ts`), `src/db` (schema and migrations), `scripts/` (seed, create-admin), `tests/`.
- Keep domain logic in `src/lib` as pure functions with unit tests. UI and server actions call those functions.
- Commit at the end of each working step, with clear messages.

## Commands

- `pnpm dev`: dev server on port 3100.
- `pnpm db:migrate`: apply migrations.
- `pnpm seed [--with-sample]`: load `seed/*.json`.
- `pnpm create-admin`: create the first Admin user interactively.
- `pnpm test`: run Vitest.
- `pnpm lint && pnpm typecheck`: run lint and type checks.

## Definition of done (every phase)

- Lint, typecheck and tests pass.
- The phase's screens work in dark and light mode, at 375px and 1440px wide.
- Every new mutation is audited and checks permissions on the server.
- `docs/PROGRESS.md` is updated.
