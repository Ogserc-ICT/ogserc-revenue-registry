# Kickoff — how to start and run the build

## Step 0: set up (about 15 minutes, done by you)

1. **Create a new, empty folder** away from your other OGSERC projects, for example `C:\dev\ogserc-revenue-register`.
2. **Unzip this pack into it.** The folder should contain `BUILD_SPEC.md`, `DESIGN.md`, `CLAUDE.md`, `KICKOFF.md`, `README.md` and `seed/`.
3. **Create a new private GitHub repo** named `ogserc-revenue-register`. Then run:
   ```
   git init
   git add .
   git commit -m "Spec pack"
   git branch -M main
   git remote add origin https://github.com/<you>/ogserc-revenue-register.git
   git push -u origin main
   ```
4. **Create a new Neon project** named `ogserc-revenue-register`, separate from every other app. Copy its connection string.
   - Create two branches in it: `main` for production and `dev` for development.
5. **Create `.env.local`** in the folder. Claude Code will make sure it is git-ignored.
   ```
   DATABASE_URL=<Neon dev branch connection string>
   AUTH_SECRET=<run: npx auth secret>
   AUTH_URL=http://localhost:3100
   APP_ENV=development
   ```
6. **Copy the OGSERC logo** into `public/brand/`. Create the folder first.
7. **Open Claude Code inside this folder** and nowhere else.

---

## Phase prompts (paste one at a time)

### Phase 1

> Read CLAUDE.md, BUILD_SPEC.md and DESIGN.md in full. Then build **Phase 1 only** (BUILD_SPEC section 11). That means the project scaffold on port 3100, the Tailwind tokens and theme toggle from DESIGN.md, the app shell and the sign-in page, Auth.js with roles, the full database schema and migrations, the seed script with `--with-sample`, Settings and lists admin, Users admin, change password, and the audit log. Before you write code, show me your plan: the file structure, schema summary and component list. Wait for my OK. When you finish, run lint, typecheck and tests, update docs/PROGRESS.md, and stop.

**Check before moving on:**

- You can sign in as Admin.
- Dark and light mode both look right.
- The sidebar pill slides between items.
- The seed loads 78 fee heads and 46 payers.
- Every settings change appears in the Audit log.

### Phase 2

> Build **Phase 2 only**: Payers (with the near-duplicate name check), Fee Schedule, the Registration Fees page with the late-registration calculator, Licence Fee Tables, and the Revenue Budget editor. Follow BUILD_SPEC sections 3, 4.6 and 4.9 and DESIGN.md. Put the amount and lookup logic in `src/lib` with unit tests. Stop when done.

**Check:**

- The calculator gives ₦7,700,000 for Cat F, 30 Jun → 31 Jul 2026.
- Adding "CCETC Taihu Distribution Ltd" warns about the existing "CCETC TAIHU".

### Phase 3

> Build **Phase 3 only**: New Demand Notice with the amount engine (BUILD_SPEC 4.2), the Demand Notices register with status, ageing and cancel (4.4, 4.5), and the demand notice print page and PDF (4.10). Use the form layout with the sticky calculation panel from DESIGN.md. Stop when done.

**Check:**

- GEN-02 for a 25 MW payer computes ₦45,000,000.
- DN-0001 shows Part-paid (overdue) once receipts exist.

### Phase 4

> Build **Phase 4 only**: New Receipt (BUILD_SPEC 4.3), the Register with filters and bulk confirm/reverse (4.4), the self-confirmation block, receipt print and PDF with the PROVISIONAL and REVERSED watermarks, and amount in words. Include the confirm and reverse animations from DESIGN.md section 5. Stop when done.

**Check:**

- A duplicate RRR is blocked.
- You cannot confirm your own receipt.
- Reversed rows are struck through and drop out of totals.

### Phase 5

> Build **Phase 5 only**: the Dashboard with the signature revenue card, Budget vs Actual, Monthly Summary, Arrears, Bank Recon and the Excel exports. Then seed with `--with-sample`, set the as-at date to 2026-11-02, and run every acceptance check in BUILD_SPEC section 10. Report each one as pass or fail. Stop when done.

**Check:** every figure in BUILD_SPEC section 10 matches.

### Phase 6

> Build **Phase 6 only**: the CI workflow, the nightly encrypted backup workflow (BUILD_SPEC 7.1), the rate-limited sign-in with lockout, the `create-admin` script, the Guide page, and a README covering deploy, region, Neon limits and restoring a backup. Then walk me through deploying to a **new** Vercel project on the Hobby plan, step by step.

**Then deploy:**

1. Create a new Vercel project and import this repo.
2. Add the environment variables, using the Neon `main` branch for `DATABASE_URL`.
3. Run `pnpm db:migrate` and `pnpm seed` against production, with no sample data.
4. Run `pnpm create-admin`.
5. Add the GitHub secrets `BACKUP_DATABASE_URL` and `BACKUP_PASSPHRASE`.
