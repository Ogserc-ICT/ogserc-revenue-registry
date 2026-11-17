# Go-live runbook

Phase 6, part 2. Do it in one sitting, about an hour. **The order matters:** the database is prepared first, and Vercel's Production settings take effect only at the merge, so the live site switches in one moment.

## Before you start

- Finance's details are in (bank accounts, signatory, fixed and not-fixed heads, receipt signatory).
- Legal's answer is recorded in `docs/hosting-decision.md`.
- The CI tick on the branch is green.
- You have access to Neon and Vercel (ictogserc@gmail.com) and GitHub, and a password manager for two new secrets.

## 1. Prepare the production database (Neon `main`)

1. In Neon, project `ogserc-revenue-register`, open **Connect** and get two strings for branch **main**, database **ogserc_revenue**:
   - **direct** (pooling off; host without `-pooler`), for steps 1, 2 and 4;
   - **pooled** (pooling on), for Vercel in step 3.
2. In a **new** PowerShell terminal, point it at `main` for this session only. Values set in the terminal take priority over `.env.local`, which stays untouched.
   ```powershell
   $env:DATABASE_URL = "<direct main string>"
   $env:APP_ENV = "production"
   node -e "console.log(new URL(process.env.DATABASE_URL).host)"
   ```
   The host must be main's endpoint, **not** `ep-icy-paper-zagrcwcl` (dev).
3. `pnpm db:migrate`. Expect "Migrations applied."
4. `pnpm seed`. **No `--with-sample`**; with `APP_ENV=production` the script refuses it anyway. Expect 78 fee heads, 76 bands, 36 payers, and no notices or receipts; numbering starts at 1.

## 2. Create the first real Admin

In the same terminal: `pnpm create-admin`. Enter the real name and work email, and leave the password blank to get a one-time temporary password. Then:
```powershell
Remove-Item Env:DATABASE_URL, Env:APP_ENV
```
and close the terminal.

## 3. Vercel Production settings (don't redeploy)

In the Pro team, project `ogserc-revenue-registry`, open **Settings › Environment Variables** and edit the **Production** values only:

| Key | Production value |
|---|---|
| `DATABASE_URL` | pooled `main` string |
| `AUTH_SECRET` | new: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL` | `https://ogserc-revenue-registry.vercel.app` |
| `APP_ENV` | `production` |

Don't redeploy: the merge in step 5 deploys with these.

## 4. Nightly backup secrets

1. Passphrase: `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`. **Save it in the password manager first.**
2. On GitHub, open **Settings › Secrets and variables › Actions** and add `BACKUP_DATABASE_URL` (the **direct** main string) and `BACKUP_PASSPHRASE`.
3. The test run comes after the merge: scheduled and manual runs use the workflow on `main`.

## 5. Merge and go live

1. Open a pull request from `feature/adjustments` to `main`. When CI is green, merge.
2. In Vercel's Deployments, wait for the new Production deployment to be **Ready**.
3. Sign in at https://ogserc-revenue-registry.vercel.app with the Admin's temporary password and set a new one. The Dashboard should show ₦0 and the Register should be empty.
4. Fill in the placeholders (BUILD_SPEC §8):
   - Receiver details: address, phone, email, bank accounts, signatory;
   - Settings: financial year, exchange rate;
   - Fee schedule: rate status and NCOA codes.
5. Add staff under Admin › Users.
6. On GitHub, open **Actions › Nightly backup › Run workflow** (main). Check the artifact exists, and that it decrypts (README, "Restoring a backup", steps 1–2).
7. Ask the former colleague to delete the old Neon database. Future work goes on new branches from `main`; each needs Preview's `AUTH_URL` set to its own address.

**Rollback:** in Vercel's Deployments, open the previous Production deployment and choose **⋯ › Instant Rollback**. To fully undo, also set Production's `DATABASE_URL` back. Neon `main` keeps its data either way.
