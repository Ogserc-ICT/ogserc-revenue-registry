# OGSERC Revenue Register

**Receipts, billing & collections.** A staff-only web app that replaces the workbook `OGSERC_Revenue_Register_FMS_v2.xlsm`:

- Revenue officers record receipts and issue demand notices.
- Finance confirms receipts against the bank or TSA statement, and imports payments handed over by the Registration & Evaluation app.
- Management reads the reports.

This is a standalone project. It shares no code, database, accounts or cookies with the other OGSERC apps (BUILD_SPEC §12).

| File | What it holds |
|---|---|
| `BUILD_SPEC.md` | What to build and the exact business rules |
| `DESIGN.md` | How it looks and moves |
| `CLAUDE.md` | Rules for anyone (or any AI assistant) changing the code |
| `REVENUE-REGISTRY-CONTRACT.md` | The payment handover format agreed with the Registration & Evaluation app |
| `docs/PROGRESS.md` | What has been built, phase by phase, and every decision made |
| `seed/` | Reference data taken from the workbook (fee heads, bands, Schedule 3, budget, payers, settings) |

## Stack

- Next.js 16 (App Router), React 19, TypeScript in strict mode, Tailwind CSS 4.
- Auth.js v5 with email and password, and roles stored in this app's own `users` table.
- PostgreSQL on Neon, through Drizzle ORM and `postgres.js`, using plain `DATABASE_URL`.
- Money is always `NUMERIC(18,2)` in the database and `decimal.js` in code. Business dates use Africa/Lagos.
- Vitest, with PGlite (Postgres in-process) for database tests. Playwright is used for screenshots.

Nothing is Vercel-specific: `pnpm build && pnpm start` runs on any Node host.

## Running it locally

You need Node 20 or later, and pnpm through Corepack (`corepack enable`).

1. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL`: the Neon **dev** branch, pooled connection string;
   - `AUTH_SECRET`: a long random string, which you can make with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;
   - `AUTH_URL`: `http://localhost:3100`;
   - `APP_ENV`: `development`.

   Never commit `.env.local`.
2. Run:

   ```
   pnpm install
   pnpm db:migrate              # apply migrations
   pnpm seed --with-sample      # reference data plus sample payers, notices and receipts (dev and preview only)
   pnpm create-admin            # first Admin user, asks for the details
   pnpm dev                     # http://localhost:3100
   ```

| Command | Does |
|---|---|
| `pnpm dev` | Dev server on port 3100 |
| `pnpm build` / `pnpm start` | Production build and server (port 3100) |
| `pnpm db:generate --name x` | New migration from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm seed` | Reference data only, as production gets it. `--with-sample` adds sample data, and is refused when `APP_ENV=production` |
| `pnpm create-admin` | Create an Admin user |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | The checks CI runs |
| `pnpm screens [route …]` | Screenshots in dark and light mode at 375px and 1440px. Needs `SCREENS_EMAIL` and `SCREENS_PASSWORD` |

## Environments

| | Where | Database | Seed |
|---|---|---|---|
| Local | `pnpm dev` | Neon `dev` branch | `--with-sample` |
| Preview | Vercel, every branch except `main` | Neon `dev` branch | `--with-sample` |
| Production | Vercel, `main` | Neon `main` branch | `pnpm seed`, **never** sample data |

Each environment has its own `AUTH_SECRET`. Preview's `AUTH_URL` is the branch's address (`…-git-<branch>-….vercel.app`). A new branch needs it changed.

## Hosting and region

- **Neon:** project `ogserc-revenue-register`, owned by the OGSERC mailbox, in **AWS eu-west-2 (London)**. The database is `ogserc_revenue`, on Postgres 18.
- **Vercel:** functions are pinned to **`lhr1` (London)** in `vercel.json`, next to the database.
- **Plan:** Vercel **Pro**, in the Commission's team owned by ictogserc@gmail.com (see `docs/hosting-decision.md`). The data lives on Neon, outside Vercel, and the app uses no Vercel-only features, so it can move host without code changes.

### Neon free plan limits

Checked on neon.com/pricing, 17 Nov 2026. Check again before relying on them.

| Limit | Free plan |
|---|---|
| Storage | 1 GB per project (20 GB across all projects) |
| Compute | 100 CU-hours per project per month, up to 2 CU |
| Branches | 10 per project |
| Scale to zero | After 5 minutes idle; can't be turned off. The first request after a quiet spell takes a few seconds |
| Point-in-time restore | **6 hours** of history only |

This app's data is small (tens of thousands of rows at most), so 1 GB is plenty. With only 6 hours of Neon history, **the nightly backup below is what protects the data.**

## Checks on every push

`.github/workflows/ci.yml` runs lint, typecheck, the tests and a production build on every push and pull request. The tests need no database or secrets.

## Nightly backup

`.github/workflows/backup.yml` runs every night at 01:00 Lagos time, and on demand from GitHub's Actions tab (**Run workflow**). It:

1. dumps the production database with `pg_dump` (custom format);
2. encrypts the dump with `gpg` (AES-256, using the passphrase);
3. keeps the encrypted file as a workflow artifact for **90 days**.

It needs two repository secrets (Settings › Secrets and variables › Actions):

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Neon **production** connection string, the **direct** one (host without `-pooler`) |
| `BACKUP_PASSPHRASE` | A long random passphrase. Keep a copy somewhere other than GitHub, such as OGSERC's password manager. Without it the backups can't be opened |

Until both secrets are set, the job skips with a note. The repository must stay **private**.

In addition, Finance downloads **Admin › Data › Export everything** weekly and keeps the file on an OGSERC drive.

### Restoring a backup

Restore into a **new** Neon branch first. Check it, then switch over. Never restore straight over production.

1. **Download.** In GitHub, open **Actions › Nightly backup**, choose the night you need, and download the artifact (a zip). Unzip it to get `ogserc-revenue-YYYY-MM-DD.dump.gpg`.
2. **Decrypt.** This needs `gpg` and the passphrase:

   ```
   gpg --decrypt --output ogserc-revenue.dump ogserc-revenue-YYYY-MM-DD.dump.gpg
   ```
3. **Make an empty target.** In Neon, create a branch (e.g. `restore-YYYY-MM-DD`). Neon branches start as copies, so create it from a point before the problem, or drop its tables first. Copy its **direct** connection string.
4. **Restore.** You need PostgreSQL **18** client tools; older `pg_restore` can't read a newer dump.

   ```
   pg_restore --no-owner --no-privileges --clean --if-exists --dbname "<direct connection string of the new branch>" ogserc-revenue.dump
   ```
5. **Check.** Point a local copy at the new branch (`DATABASE_URL` in `.env.local`) and look at the Register, the latest receipt numbers and the Audit log.
6. **Switch.** Set Vercel Production's `DATABASE_URL` to the restored branch, or make it Neon's primary branch, then redeploy. Record in `docs/` what was restored, from which night, and why. The app's Audit log only records what happens inside the app.

Delete the decrypted `.dump` file when you're done: it holds licensees' financial data unencrypted.

## Data protection

The app holds licensees' financial data. BUILD_SPEC §7.2 asks OGSERC management or Legal to confirm the obligations under the **Nigeria Data Protection Act 2023**. Record the outcome in `docs/hosting-decision.md`.
