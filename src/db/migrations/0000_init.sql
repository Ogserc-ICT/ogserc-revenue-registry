CREATE TYPE "public"."budget_to_date_rule" AS ENUM('including_current_month', 'completed_months_only');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('NGN', 'USD');--> statement-breakpoint
CREATE TYPE "public"."fee_basis" AS ENUM('Fixed', 'Per MW', 'MW Band', '% of Revenue', 'Per Unit', 'Per Day', 'Variable');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('Pending Confirmation', 'Confirmed', 'Reversed');--> statement-breakpoint
CREATE TYPE "public"."revenue_type" AS ENUM('IGR', 'Non-IGR');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'revenue_officer', 'finance_officer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."serial_key" AS ENUM('receipt', 'dn', 'payer');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"reference" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "bank_statement_totals" (
	"id" serial PRIMARY KEY NOT NULL,
	"financial_year" integer NOT NULL,
	"month" smallint NOT NULL,
	"collecting_account" text NOT NULL,
	"statement_total" numeric(18, 2) NOT NULL,
	"entered_by_id" uuid,
	"entered_by" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_totals_month" CHECK ("bank_statement_totals"."month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_code" text NOT NULL,
	"group_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dn_no" text NOT NULL,
	"issue_date" date NOT NULL,
	"payer_id" text NOT NULL,
	"payer_name" text NOT NULL,
	"revenue_code" text NOT NULL,
	"revenue_head" text NOT NULL,
	"period" text,
	"basis_qty" numeric(20, 4),
	"rate_used" numeric(18, 6),
	"fx_used" numeric(18, 6),
	"amount_billed" numeric(18, 2) NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"due_date" date GENERATED ALWAYS AS (issue_date + payment_terms_days) STORED,
	"cancelled" boolean DEFAULT false NOT NULL,
	"cancelled_by_id" uuid,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"issued_by_id" uuid,
	"issued_by" text NOT NULL,
	"remarks" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demand_notices_dn_no_unique" UNIQUE("dn_no"),
	CONSTRAINT "demand_notices_amount_positive" CHECK ("demand_notices"."amount_billed" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"code" text PRIMARY KEY NOT NULL,
	"head" text NOT NULL,
	"category" text NOT NULL,
	"applies_to" text,
	"basis" "fee_basis" NOT NULL,
	"currency" "currency" DEFAULT 'NGN' NOT NULL,
	"published_rate" numeric(18, 6),
	"published_rate_text" text,
	"cap_ngn" numeric(18, 2),
	"unit_basis" text,
	"frequency" text,
	"revenue_type" "revenue_type" NOT NULL,
	"budget_line_id" text,
	"legal_basis" text,
	"ncoa_code" text,
	"rate_status" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licence_fee_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"fee" text NOT NULL,
	"band_label" text NOT NULL,
	"above_mw" numeric(12, 3) NOT NULL,
	"up_to_mw" numeric(12, 3) NOT NULL,
	"published_rate" numeric(18, 6) NOT NULL,
	"currency" "currency" NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_name" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"payer_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"licence_no" text,
	"licence_status" text,
	"capacity_mw" numeric(12, 3),
	"revenue_base_ngn" numeric(18, 2),
	"lga" text,
	"address" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"date_registered" date,
	"notes" text,
	"sch3_category" text,
	"expected_reg_month" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payers_expected_reg_month_valid" CHECK ("payers"."expected_reg_month" IS NULL OR "payers"."expected_reg_month" IN ('1','2','3','4','5','6','7','8','9','10','11','12','Even'))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_no" text NOT NULL,
	"receipt_date" date NOT NULL,
	"payer_id" text NOT NULL,
	"payer_name" text NOT NULL,
	"payer_category" text,
	"revenue_code" text NOT NULL,
	"revenue_head" text NOT NULL,
	"revenue_category" text NOT NULL,
	"revenue_type" "revenue_type" NOT NULL,
	"budget_line_id" text,
	"dn_no" text,
	"period" text,
	"basis_qty" numeric(20, 4),
	"rate_used" numeric(18, 6),
	"fx_used" numeric(18, 6),
	"amount_due" numeric(18, 2) NOT NULL,
	"amount_paid" numeric(18, 2) NOT NULL,
	"channel" text NOT NULL,
	"collecting_account" text NOT NULL,
	"payment_ref" text NOT NULL,
	"value_date" date NOT NULL,
	"status" "receipt_status" DEFAULT 'Pending Confirmation' NOT NULL,
	"confirmed_by_id" uuid,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"reversed_by_id" uuid,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reverse_reason" text,
	"recorded_by_id" uuid,
	"recorded_by" text NOT NULL,
	"remarks" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_receipt_no_unique" UNIQUE("receipt_no"),
	CONSTRAINT "receipts_amount_paid_positive" CHECK ("receipts"."amount_paid" > 0)
);
--> statement-breakpoint
CREATE TABLE "revenue_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"financial_year" integer NOT NULL,
	"budget_line_id" text NOT NULL,
	"month" smallint NOT NULL,
	"amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	"source_note" text,
	CONSTRAINT "revenue_budget_month" CHECK ("revenue_budget"."month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "sch3_late_charges" (
	"group" text PRIMARY KEY NOT NULL,
	"categories" text NOT NULL,
	"initial_ngn" numeric(18, 2) NOT NULL,
	"daily_ngn" numeric(18, 2) NOT NULL,
	"daily_cap_ngn" numeric(18, 2) NOT NULL,
	"initial_code" text NOT NULL,
	"daily_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sch3_registration_fees" (
	"category" text PRIMARY KEY NOT NULL,
	"registrant" text NOT NULL,
	"fee_ngn" numeric(18, 2) NOT NULL,
	"late_group" text,
	"revenue_code" text NOT NULL,
	"budget_line_id" text
);
--> statement-breakpoint
CREATE TABLE "serials" (
	"key" serial_key NOT NULL,
	"year" integer DEFAULT 0 NOT NULL,
	"next_value" integer NOT NULL,
	CONSTRAINT "serials_key_year_pk" PRIMARY KEY("key","year"),
	CONSTRAINT "serials_next_value_positive" CHECK ("serials"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"org_name" text NOT NULL,
	"address_line" text DEFAULT '' NOT NULL,
	"financial_year" integer NOT NULL,
	"receipt_prefix" text DEFAULT 'OGSERC/RCT' NOT NULL,
	"dn_prefix" text DEFAULT 'OGSERC/DN' NOT NULL,
	"payer_prefix" text DEFAULT 'OGS-P-' NOT NULL,
	"default_terms_days" integer DEFAULT 30 NOT NULL,
	"as_at_date" date,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"usd_ngn_rate" numeric(18, 6) DEFAULT '1500' NOT NULL,
	"budget_version_label" text DEFAULT '' NOT NULL,
	"budget_to_date_rule" "budget_to_date_rule" DEFAULT 'including_current_month' NOT NULL,
	"dn_payment_instructions" text DEFAULT '' NOT NULL,
	"dn_signatory" text DEFAULT '' NOT NULL,
	"late_payment_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"succeeded" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"roles" "role"[] DEFAULT '{}'::role[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_totals" ADD CONSTRAINT "bank_statement_totals_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_notices" ADD CONSTRAINT "demand_notices_payer_id_payers_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("payer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_notices" ADD CONSTRAINT "demand_notices_revenue_code_fee_heads_code_fk" FOREIGN KEY ("revenue_code") REFERENCES "public"."fee_heads"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_notices" ADD CONSTRAINT "demand_notices_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_notices" ADD CONSTRAINT "demand_notices_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payers" ADD CONSTRAINT "payers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payer_id_payers_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("payer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_revenue_code_fee_heads_code_fk" FOREIGN KEY ("revenue_code") REFERENCES "public"."fee_heads"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_dn_no_demand_notices_dn_no_fk" FOREIGN KEY ("dn_no") REFERENCES "public"."demand_notices"("dn_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reversed_by_id_users_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_budget" ADD CONSTRAINT "revenue_budget_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sch3_registration_fees" ADD CONSTRAINT "sch3_registration_fees_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_totals_uq" ON "bank_statement_totals" USING btree ("financial_year","month","collecting_account");--> statement-breakpoint
CREATE INDEX "demand_notices_payer_idx" ON "demand_notices" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "demand_notices_issue_date_idx" ON "demand_notices" USING btree ("issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "licence_fee_bands_code_range_uq" ON "licence_fee_bands" USING btree ("code","above_mw","up_to_mw");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_name_value_uq" ON "lists" USING btree ("list_name",lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX "payers_name_lower_uq" ON "payers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "receipts_receipt_date_idx" ON "receipts" USING btree ("receipt_date");--> statement-breakpoint
CREATE INDEX "receipts_value_date_idx" ON "receipts" USING btree ("value_date");--> statement-breakpoint
CREATE INDEX "receipts_payer_idx" ON "receipts" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "receipts_dn_idx" ON "receipts" USING btree ("dn_no");--> statement-breakpoint
CREATE INDEX "receipts_status_idx" ON "receipts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_payment_ref_live_uq" ON "receipts" USING btree (lower("payment_ref")) WHERE "receipts"."status" <> 'Reversed';--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_budget_uq" ON "revenue_budget" USING btree ("financial_year","budget_line_id","month");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_email_at_idx" ON "sign_in_attempts" USING btree (lower("email"),"at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));