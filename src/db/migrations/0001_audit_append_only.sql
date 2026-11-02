-- audit_log is append-only (BUILD_SPEC 3, CLAUDE.md rule 5).
-- Any UPDATE, DELETE or TRUNCATE raises an error, whichever role runs it.
CREATE OR REPLACE FUNCTION audit_log_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_change();
--> statement-breakpoint
-- No hard deletes of receipts, demand notices or payers (CLAUDE.md rule 7).
CREATE OR REPLACE FUNCTION block_hard_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted; reverse, cancel or deactivate instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION block_hard_delete();
--> statement-breakpoint
CREATE TRIGGER demand_notices_no_delete BEFORE DELETE ON demand_notices
  FOR EACH ROW EXECUTE FUNCTION block_hard_delete();
--> statement-breakpoint
CREATE TRIGGER payers_no_delete BEFORE DELETE ON payers
  FOR EACH ROW EXECUTE FUNCTION block_hard_delete();
