-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'pending_payment', 'active');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly_paise" INTEGER NOT NULL,
    "trial_days" INTEGER NOT NULL,
    "feature_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_members" INTEGER,
    "max_staff" INTEGER,
    "max_branches" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL,
    "plan_name" TEXT,
    "price_monthly_paise" INTEGER,
    "feature_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_members" INTEGER,
    "max_staff" INTEGER,
    "max_branches" INTEGER,
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_gym_id_idx" ON "subscriptions"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_one_pending_per_gym" ON "subscriptions"("gym_id") WHERE ("status" = 'pending_payment');

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_one_trial_per_gym" ON "subscriptions"("gym_id") WHERE ("status" = 'trialing');

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Plan values the service also validates. Prisma creates scalar lists as
-- nullable text[], so NOT NULL for feature_flags lives here.
ALTER TABLE "plans" ADD CONSTRAINT "plans_values_check" CHECK (
  "code" ~ '^[a-z][a-z0-9_]{0,31}$'
  AND char_length("name") BETWEEN 1 AND 64
  AND "price_monthly_paise" >= 0
  AND "trial_days" BETWEEN 0 AND 365
  AND "feature_flags" IS NOT NULL
  AND cardinality("feature_flags") <= 50
  AND ("max_members" IS NULL OR "max_members" >= 0)
  AND ("max_staff" IS NULL OR "max_staff" >= 0)
  AND ("max_branches" IS NULL OR "max_branches" >= 0)
);

-- A Plan_Request has no snapshot and no period. A trialing or active row
-- always has both, and its period never ends before it starts.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_state_check" CHECK (
  "feature_flags" IS NOT NULL
  AND (
    (
      "status" = 'pending_payment'
      AND "current_period_start" IS NULL
      AND "current_period_end" IS NULL
      AND "plan_name" IS NULL
      AND "price_monthly_paise" IS NULL
    )
    OR (
      "status" <> 'pending_payment'
      AND "current_period_start" IS NOT NULL
      AND "current_period_end" IS NOT NULL
      AND "current_period_end" >= "current_period_start"
      AND "plan_name" IS NOT NULL
      AND "price_monthly_paise" IS NOT NULL
    )
  )
);
