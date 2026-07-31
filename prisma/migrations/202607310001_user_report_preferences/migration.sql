-- Per-user report / digest preferences
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_digest_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receive_website_report" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receive_smm_report" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receive_combined_report" BOOLEAN NOT NULL DEFAULT false;

-- Sensible defaults by role for existing rows
UPDATE "users" SET
  "weekly_digest_enabled" = CASE
    WHEN "role" IN ('user', 'viewer', 'smm') THEN true
    ELSE false
  END,
  "receive_website_report" = CASE
    WHEN "role" = 'approver' THEN true
    ELSE false
  END,
  "receive_smm_report" = CASE
    WHEN "role" = 'approver' THEN true
    ELSE false
  END,
  "receive_combined_report" = false;
