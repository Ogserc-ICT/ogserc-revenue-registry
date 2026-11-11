ALTER TABLE "settings" ADD COLUMN "org_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "org_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "payment_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "signatory_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "signatory_designation" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Split the old one-line signatory ("[Name], Head, Finance & Accounts") into name and designation.
UPDATE "settings" SET
  "signatory_name" = btrim(split_part("dn_signatory", ',', 1)),
  "signatory_designation" = CASE WHEN position(',' in "dn_signatory") > 0
    THEN btrim(substr("dn_signatory", position(',' in "dn_signatory") + 1)) ELSE '' END;--> statement-breakpoint
-- Remita is no longer a collecting account (owner's decision, Nov 2026). Kept, inactive, for old receipts.
UPDATE "lists" SET "active" = false WHERE "list_name" = 'Collecting accounts' AND lower("value") = lower('Ogun State TSA - Remita');
