# Payment handover: contract between Registration & Evaluation and the Revenue Registry

**Format version 1 · 15 Nov 2026 · status: built in R&E (Phase 11a); §8 is a draft**

Two separate apps, built by two people, exchange one thing: confirmed payments. This document is the only thing they share. Neither app reads the other's database, code or screens. If something here is unclear, change this document first (and bump the date), then the code.

- **R&E**: the OGSERC Registration & Evaluation app. It records payments, Finance confirms them, and it hands them over.
- **RR**: the Revenue Registry app. It imports what R&E hands over and keeps the Commission's revenue record.

## 1. Who owns what

| Thing | Owner | The other app |
| --- | --- | --- |
| Payments for registrations and own-use notifications, their PAY numbers, Finance confirmation and reversal | R&E | Never creates, edits or renumbers them |
| Handover batches and their numbers | R&E | Imports them; never edits a batch |
| The revenue record, receipts, revenue reports, its own numbers | RR | R&E knows nothing about them |
| This document | Both | Changes agreed by both |

R&E never needs anything back from RR to work. RR never needs R&E to be up to import a file it already has.

## 2. Identifiers (all text, never numbers)

| Identifier | Format | Example | Rules |
| --- | --- | --- | --- |
| PAY number | `OGSERC/PAY/{year}/{5 digits}` | `OGSERC/PAY/2026/00012` | Issued once by R&E, never reused, never changed. Year = the year the payment was received. |
| Line ID | `{PAY number}:P` for a payment, `{PAY number}:R` for its reversal | `OGSERC/PAY/2026/00012:R` | **The import key.** Unique forever. Each appears in exactly one batch, once. |
| Batch number | `OGSERC/EXP/{year}/{4 digits}` | `OGSERC/EXP/2026/0001` | Issued once by R&E, never reused. Year = the Lagos year the batch was prepared. Restarts at 0001 each year. |
| ACK number | `OGSERC/ACK/{year}/{5 digits}` | `OGSERC/ACK/2026/00031` | The filing the payment was quoted against. Information only. |
| Registration number | `OGSERC/REG/{year}/{category}-{activity}/{4 digits}` | `OGSERC/REG/2026/D-GEN/0007` | Blank until the operator is registered. Information only. |
| OUN | `OGSERC/OUN/{year}/{4 digits}` | `OGSERC/OUN/2026/0003` | Own-use notification number. Information only. |

**RR must not issue numbers that start with `OGSERC/PAY`, `OGSERC/EXP`, `OGSERC/ACK`, `OGSERC/REG` or `OGSERC/OUN`.** Use RR's own prefix for RR's own numbers.

## 3. What goes into a batch

R&E prepares a batch when a Finance officer clicks **Prepare handover**. A batch holds:

1. A **Payment line** for every payment Finance has confirmed that is not in an earlier batch, whenever it was confirmed.
2. A **Reversal line** for every payment that was handed over in an earlier batch and has since been reversed.

Never in a batch:
- a payment still pending, or rejected by Finance (it never counted);
- a payment confirmed and then reversed **before** it was ever handed over (it is left out entirely: RR never hears of it, and nothing is owed).

So, over all batches, for every PAY number RR receives either nothing, a Payment line, or a Payment line and later a Reversal line. A reversal is final in R&E: there is never a third line. A Reversal line is always in a **later** batch than its Payment line.

A batch is **frozen** when it is prepared: downloading it again gives the same lines, the same totals and the same checksum. Names and details are as they were at that moment; a later correction in R&E does not change a batch already prepared.

## 4. The file

One Excel workbook (`.xlsx`) per batch, named after the batch: `OGSERC-EXP-2026-0001.xlsx`. R&E can also give the same Payments sheet as CSV (UTF-8 with BOM, comma, `"` quoting, header row), named `OGSERC-EXP-2026-0001.csv`; the Batch sheet's values are then not in the file, so RR should prefer the `.xlsx`.

### 4.1 Sheet `Payments`

Row 1 is the header, exactly as below. One line per row from row 2, in Line ID order. **Read columns by their header name, not their position**, and ignore any column you do not know (R&E may add columns at the end; see §7).

Every cell is stored as **text** except the two amount columns, which are numbers. Dates are text `YYYY-MM-DD`, the calendar date in Africa/Lagos (no time zone conversion needed or wanted). Empty means empty string or blank cell; treat both the same.

| # | Header | Type | Always filled | Meaning |
| --- | --- | --- | --- | --- |
| 1 | `Line ID` | text | yes | The import key (§2) |
| 2 | `Line type` | text | yes | `Payment` or `Reversal` |
| 3 | `PAY no.` | text | yes | The payment |
| 4 | `Batch no.` | text | yes | This batch |
| 5 | `Date received` | date text | yes | When the money was received |
| 6 | `Date confirmed` | date text | yes | When Finance confirmed it in R&E |
| 7 | `Amount (NGN)` | number, 2 decimals | yes | Naira. **Negative on a Reversal line.** For people; see column 8 |
| 8 | `Amount (kobo)` | integer | yes | **The authoritative amount.** Negative on a Reversal line. Column 7 = column 8 ÷ 100 |
| 9 | `Purpose` | text | no | `Registration fee`, `Late registration charge` or `Fee and late charge` (an admin-editable list in R&E; new values may appear) |
| 10 | `Revenue code` | text | no | The code an R&E admin sets against the purpose (Admin › Reference data › Lists › Payment purposes). Blank until Finance supplies the codes (open question Q29) |
| 11 | `Channel` | text | no | `Remita`, `Bank transfer`, `POS`, `Other` (admin-editable list) |
| 12 | `RRR` | text | no | Remita Retrieval Reference, as entered |
| 13 | `Payer` | text | yes | Registered name of the operator, or the own-use notifier's name |
| 14 | `Paid for` | text | yes | `Registration` or `Own-use notification` |
| 15 | `Filing type` | text | yes | `New registration`, `Update`, `Annual confirmation` or `Own-use notification` |
| 16 | `ACK no.` | text | yes | The filing it was paid against |
| 17 | `Registration no. / OUN` | text | no | Blank if not yet registered |
| 18 | `Category` | text | no | Schedule 3 category, `A` to `K` |
| 19 | `LGA` | text | no | Principal LGA (one of Ogun's 20) |
| 20 | `Recorded by` | text | yes | Staff name who recorded the payment in R&E |
| 21 | `Confirmed by` | text | yes | Finance officer who confirmed it |
| 22 | `Verified with bank` | text | yes | `Y` or `N` (R&E requires the bank / Remita check to confirm, so in practice `Y`) |
| 23 | `Reversed on` | date text | Reversal only | Date of the reversal |
| 24 | `Reversed by` | text | Reversal only | Who reversed it |
| 25 | `Reversal reason` | text | Reversal only | Why |

On a Reversal line, columns 3 and 5 to 22 repeat the original payment's values (amount negated), so a Reversal line can be read on its own.

### 4.2 Sheet `Batch`

Two columns, `Field` and `Value`, one field per row, in this order. All values are text except the counts and totals, which are integers.

| Field | Example | Meaning |
| --- | --- | --- |
| `Format` | `OGSERC payment handover` | Fixed |
| `Format version` | `1` | See §7 |
| `Source` | `OGSERC Registration & Evaluation` | Fixed |
| `Batch no.` | `OGSERC/EXP/2026/0001` | |
| `Prepared at` | `2026-11-20T09:15:02+01:00` | ISO 8601, Lagos time |
| `Prepared by` | staff name | |
| `Confirmed from` | `2026-11-02` | Earliest `Date confirmed` among Payment lines (blank if none) |
| `Confirmed to` | `2026-11-19` | Latest (blank if none) |
| `Payment lines` | `14` | Count of `Payment` lines |
| `Reversal lines` | `1` | Count of `Reversal` lines |
| `Payment total (kobo)` | `125000000` | Sum of column 8 over Payment lines |
| `Reversal total (kobo)` | `-5000000` | Sum of column 8 over Reversal lines (zero or negative) |
| `Net total (kobo)` | `120000000` | Sum of both |
| `Checksum (SHA-256)` | 64 hex characters | §4.3 |

### 4.3 The checksum

So RR can tell the file is complete and unaltered:

1. Take the lines in file order (Line ID order).
2. For each, write `{Line ID}|{Amount (kobo)}`, e.g. `OGSERC/PAY/2026/00012:P|5000000`.
3. Join them with a single `\n` (no trailing newline).
4. SHA-256 of that text as UTF-8, written as lowercase hex.

In TypeScript: `createHash("sha256").update(lines.map(l => `${l.lineId}|${l.amountKobo}`).join("\n"), "utf8").digest("hex")`.

## 5. What RR does when importing (required)

All of this in **one database transaction per file**: a file imports completely or not at all.

1. **Check the format.** Both sheets present; every header in §4.1 present; `Format version` is `1`. Otherwise refuse the file and say why.
2. **Check the totals.** Recount the lines and re-add `Amount (kobo)`; recompute the checksum. All must equal the Batch sheet. Otherwise refuse the file ("incomplete or altered").
3. **Check each line.** `Line ID` = `PAY no.` + `:P` or `:R` matching `Line type`; `Amount (NGN)` × 100 = `Amount (kobo)`; Payment amounts positive, Reversal amounts negative; every `Batch no.` equals the batch's. Otherwise refuse the file.
4. **The same batch again.** If RR already imported this `Batch no.` with the same checksum: do nothing and say "already imported". Same batch number, different checksum: refuse (something is wrong; tell R&E).
5. **Lines already held.** A `Line ID` RR already holds with the same amount: skip it. With a different amount: refuse the file.
6. **A Reversal line** whose Payment line (`{PAY no.}:P`) RR does not hold: refuse the file with "import the earlier batch first". (Its Payment line is always in an earlier batch.)
7. **Store each line as received**, keyed by `Line ID`, with the batch number. A reversal is its own negative entry linked to the payment by `PAY no.`; never edit or delete the original Payment line.
8. **Record the batch**: batch number, checksum, counts, net total, when imported and by whom.

Recommended:
- Warn (do not refuse) when the previous batch of the same year (`…/0006` before `…/0007`) has not been imported, so a missed file is noticed.
- Show the person importing the batch's counts and net total before they confirm, and the result after: lines added, lines skipped as already held.
- Keep the uploaded file (e.g. Vercel Blob) with the batch record.
- Unique constraints in RR's database on `Line ID` and on `Batch no.`.

Not wanted:
- Matching or merging on payer name, RRR or amount. The `Line ID` is the only key.
- Parsing numbers out of identifiers. Treat every identifier as opaque text.
- Reading Excel date cells. Dates are text on purpose.

## 6. What R&E guarantees

- A Line ID, PAY number or batch number is never reused or changed.
- A batch never changes after it is prepared, and can be downloaded again at any time.
- A line is never in two batches.
- Reversals always come in a later batch than the payment.
- Every batch prepared or downloaded is in R&E's audit log.
- Finance marks a batch "Imported into the Revenue Registry" in R&E once RR has it (manual in 11a; automatic in 11b).

## 7. Changes to this format

- **Adding** a column (at the end of the Payments sheet) or a field (at the end of the Batch sheet) keeps format version `1`. RR must ignore what it does not know.
- **Renaming, removing, reordering meaning, or changing a type** needs format version `2`, agreed here first. R&E then produces version 2 only after RR can read it.
- New values in `Purpose` or `Channel` can appear at any time (admin lists); RR should accept any text there.

## 8. Direct feed (Phase 11b, draft: not built, to agree)

The same batches over HTTPS, so nobody downloads or uploads files. RR pulls; R&E never calls RR.

- **Auth**: `Authorization: Bearer {HANDOVER_API_KEY}`, a long random secret set in both Vercel projects. HTTPS only. Read-only apart from the "imported" call.
- `GET /api/handover/batches?year=2026&after=OGSERC%2FEXP%2F2026%2F0006`: the batches after that one, oldest first: `[{ "batchNo", "preparedAt", "paymentLines", "reversalLines", "netTotalKobo", "checksum" }]`.
- `GET /api/handover/batches/OGSERC-EXP-2026-0007`: one batch: `{ "formatVersion": 1, "batch": { …the Batch sheet fields in camelCase… }, "lines": [ { "lineId", "lineType", "payNo", "batchNo", "dateReceived", "dateConfirmed", "amountKobo", "purpose", "revenueCode", "channel", "rrr", "payer", "paidFor", "filingType", "ackNo", "registrationNoOrOun", "category", "lga", "recordedBy", "confirmedBy", "verifiedWithBank", "reversedOn", "reversedBy", "reversalReason" } ] }`. Same lines, same order, same checksum as the file; `amountKobo` is an integer; there is no naira field.
- `POST /api/handover/batches/OGSERC-EXP-2026-0007/imported` with `{ "checksum", "importedAt", "importedBy", "linesAdded", "linesSkipped" }`: R&E records the batch as imported (refused if the checksum differs).
- RR's import rules (§5) apply unchanged.
- Optional: R&E prepares a batch automatically each morning at 07:00, so the feed always has yesterday's confirmations.

## 9. Testing together

Sample files to build against now, before any real batch exists: `docs/handover-samples/` in the R&E repository (`OGSERC-EXP-2026-0001.xlsx` with four payments, one of them own-use; `OGSERC-EXP-2026-0002.xlsx` with the reversal of `OGSERC/PAY/2026/00003` and one new payment; CSV copies of both). Everything in them is made up and marked SAMPLE. Expected net totals: 77500000 and 35000000 kobo; checksums `71e11af0…5c18ec` and `7884d722…57e595` (full values on each Batch sheet).

1. R&E prepares a batch on a **preview** deployment with test payments (including one reversal across two batches) and sends the two `.xlsx` files.
2. RR imports batch 1, then batch 1 again (expect "already imported"), then batch 2 (expect the reversal accepted), then an edited copy of batch 2 with one amount changed (expect it refused).
3. Both sides compare the net totals.

## 10. Open questions

- **Q29 (Finance)**: revenue codes per purpose, and whether "Fee and late charge" must be split into two lines.
- **Q30 (RR developer)**: anything in §4 or §5 RR cannot do; whether RR wants the direct feed (§8).
