# Hosting decision

BUILD_SPEC §7.1 and §7.2. Fill this in before go-live. Each section needs an answer from someone outside the development work.

## 1. Vercel plan

**Status: not yet asked.**

The app runs on the Vercel **Hobby** plan. Hobby is meant for non-commercial use, and Vercel can pause a project it judges commercial. We should ask Vercel whether this use is acceptable, and keep their answer here.

Suggested post for community.vercel.com:

> We are the Ogun State Electricity Regulatory Commission (OGSERC), a state government regulator in Nigeria. An employee has built an internal, staff-only web app on the Hobby plan. It records the regulator's own revenue receipts and billing. There are no public users, no payments are taken through the app, and it doesn't generate revenue for anyone. About ten staff use it. Is the Hobby plan acceptable for this, or do we need Pro?

| | |
|---|---|
| Posted on | |
| Link | |
| Vercel's answer | |
| Decision (Hobby / Pro) | |

If Vercel says Pro is required, change the plan. No code changes are needed.

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
| Vercel project | To move to ictogserc@gmail.com in Phase 6. Functions pinned to `lhr1` (London) |
| Backups | GitHub Actions artifacts, encrypted, 90 days (README, "Nightly backup") |
