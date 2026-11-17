# Hosting decision

BUILD_SPEC §7.1 and §7.2. Fill this in before go-live. Each section needs an answer from someone outside the development work.

## 1. Vercel plan

**Status: settled (17 Nov 2026).** The Commission's Vercel team is on **Pro**, owned by ictogserc@gmail.com. Pro allows organisational and commercial use, so the Hobby question in BUILD_SPEC §7.1 (and the community-forum post) no longer applies.

Confirmed:

| | |
|---|---|
| Vercel team on Pro (name) | |
| Checked in Settings › Billing (who, when) | Project owner, 17 Nov 2026 |
| Team owner, and whether ictogserc@gmail.com is a member | Owned by ictogserc@gmail.com |
| Team the production project will live in | This Pro team. The existing project (ogserc-revenue-registry.vercel.app) is already in it and will be reused |

Nothing in the code depends on the plan. The app still uses no Vercel-only features (CLAUDE.md rule 8), so it can move to another host unchanged.

## 2. Data protection (Nigeria Data Protection Act 2023)

**Status: not yet asked.**

The app holds licensees' names, addresses, contact details and payment records. OGSERC management or Legal should confirm:

- whether OGSERC must register with or notify the Nigeria Data Protection Commission for this processing;
- whether hosting outside Nigeria is acceptable: the data is on Neon, in AWS London, and the app runs on Vercel, in London;
- how long payment records and backups must be kept. Backups are currently kept for 90 days, and records indefinitely;
- who may hold the backup passphrase.

| | |
|---|---|
| Asked (who, when) | |
| Answer | |
| Actions needed | |

## 3. Where things are

| Item | Value |
|---|---|
| Neon project | `ogserc-revenue-register`, owned by ictogserc@gmail.com, AWS eu-west-2 (London) |
| Vercel project | `ogserc-revenue-registry`, already in the Commission's Pro team (owner ictogserc@gmail.com). Functions pinned to `lhr1` (London) |
| Backups | GitHub Actions artifacts, encrypted, 90 days (README, "Nightly backup") |
