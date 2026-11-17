CREATE TYPE "public"."handover_line_type" AS ENUM('Payment', 'Reversal');--> statement-breakpoint
CREATE TABLE "handover_batches" (
	"batch_no" text PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"format_version" integer NOT NULL,
	"prepared_at" text,
	"prepared_by" text,
	"confirmed_from" date,
	"confirmed_to" date,
	"payment_lines" integer NOT NULL,
	"reversal_lines" integer NOT NULL,
	"payment_total" numeric(18, 2) NOT NULL,
	"reversal_total" numeric(18, 2) NOT NULL,
	"net_total" numeric(18, 2) NOT NULL,
	"lines_added" integer NOT NULL,
	"lines_skipped" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_bytes" "bytea" NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by_id" uuid,
	"imported_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_lines" (
	"line_id" text PRIMARY KEY NOT NULL,
	"line_type" "handover_line_type" NOT NULL,
	"pay_no" text NOT NULL,
	"batch_no" text NOT NULL,
	"date_received" date NOT NULL,
	"date_confirmed" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"purpose" text,
	"revenue_code" text,
	"channel" text,
	"rrr" text,
	"payer" text NOT NULL,
	"paid_for" text,
	"filing_type" text,
	"ack_no" text,
	"registration_no" text,
	"category" text,
	"lga" text,
	"recorded_by" text,
	"confirmed_by" text,
	"verified_with_bank" text,
	"reversed_on" date,
	"reversed_by" text,
	"reversal_reason" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_lines_sign" CHECK (("handover_lines"."line_type" = 'Payment' AND "handover_lines"."amount" > 0) OR ("handover_lines"."line_type" = 'Reversal' AND "handover_lines"."amount" < 0))
);
--> statement-breakpoint
ALTER TABLE "handover_batches" ADD CONSTRAINT "handover_batches_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_lines" ADD CONSTRAINT "handover_lines_batch_no_handover_batches_batch_no_fk" FOREIGN KEY ("batch_no") REFERENCES "public"."handover_batches"("batch_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handover_lines_pay_no_idx" ON "handover_lines" USING btree ("pay_no");--> statement-breakpoint
CREATE INDEX "handover_lines_batch_idx" ON "handover_lines" USING btree ("batch_no");--> statement-breakpoint
-- Handover lines and batches are stored as received and never changed (contract §5.7).
CREATE OR REPLACE FUNCTION handover_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;--> statement-breakpoint
CREATE TRIGGER handover_batches_append_only BEFORE UPDATE OR DELETE ON handover_batches
  FOR EACH ROW EXECUTE FUNCTION handover_block_change();--> statement-breakpoint
CREATE TRIGGER handover_lines_append_only BEFORE UPDATE OR DELETE ON handover_lines
  FOR EACH ROW EXECUTE FUNCTION handover_block_change();--> statement-breakpoint
CREATE TRIGGER handover_batches_no_truncate BEFORE TRUNCATE ON handover_batches
  FOR EACH STATEMENT EXECUTE FUNCTION handover_block_change();--> statement-breakpoint
CREATE TRIGGER handover_lines_no_truncate BEFORE TRUNCATE ON handover_lines
  FOR EACH STATEMENT EXECUTE FUNCTION handover_block_change();
