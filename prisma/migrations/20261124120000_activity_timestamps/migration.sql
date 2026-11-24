ALTER TABLE "user_accounts" ADD COLUMN "created_at" TIMESTAMPTZ(3);
UPDATE "user_accounts" SET "created_at" = TIMESTAMP '1970-01-01 00:00:00+00' WHERE "created_at" IS NULL;
ALTER TABLE "user_accounts" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "user_accounts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "gyms" ADD COLUMN "submitted_at" TIMESTAMPTZ(3);
ALTER TABLE "gyms" ADD COLUMN "activated_at" TIMESTAMPTZ(3);

ALTER TABLE "subscriptions" ADD COLUMN "started_at" TIMESTAMPTZ(3);
ALTER TABLE "subscriptions" ADD COLUMN "expired_at" TIMESTAMPTZ(3);

UPDATE "subscriptions"
SET "started_at" = "created_at"
WHERE "status" IN ('trialing', 'active') AND "started_at" IS NULL;

UPDATE "subscriptions"
SET "expired_at" = "current_period_end"
WHERE "current_period_end" IS NOT NULL AND "expired_at" IS NULL;
