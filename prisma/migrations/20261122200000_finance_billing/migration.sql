-- AlterEnum
ALTER TYPE "subscription_status" ADD VALUE 'failed';

-- CreateEnum
CREATE TYPE "platform_charge_status" AS ENUM ('paid', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "platform_charges" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "commission_percent" INTEGER NOT NULL,
    "commission_paise" INTEGER NOT NULL,
    "status" "platform_charge_status" NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "refunded_at" TIMESTAMPTZ(3),

    CONSTRAINT "platform_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_charges_gym_id_recorded_at_idx" ON "platform_charges"("gym_id", "recorded_at");

-- CreateIndex
CREATE INDEX "platform_charges_status_recorded_at_idx" ON "platform_charges"("status", "recorded_at");

-- CreateIndex
CREATE INDEX "expenses_gym_id_paid_on_idx" ON "expenses"("gym_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_month_key" ON "settlements"("month");

-- AddForeignKey
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_values_check" CHECK (
  "amount_paise" >= 0
  AND "commission_percent" BETWEEN 0 AND 100
  AND "commission_paise" >= 0
  AND "commission_paise" <= "amount_paise"
  AND (
    ("status" = 'refunded' AND "refunded_at" IS NOT NULL)
    OR ("status" IN ('paid', 'failed') AND "refunded_at" IS NULL)
  )
);

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_values_check" CHECK (
  char_length("category") BETWEEN 1 AND 64
  AND "amount_paise" >= 1
  AND ("notes" IS NULL OR char_length("notes") <= 500)
);

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_month_check" CHECK (
  "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND "amount_paise" >= 0
);

ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_state_check";

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_state_check" CHECK (
  "feature_flags" IS NOT NULL
  AND (
    (
      "status" IN ('pending_payment', 'failed')
      AND "current_period_start" IS NULL
      AND "current_period_end" IS NULL
      AND "plan_name" IS NULL
      AND "price_monthly_paise" IS NULL
    )
    OR (
      "status" IN ('trialing', 'active')
      AND "current_period_start" IS NOT NULL
      AND "current_period_end" IS NOT NULL
      AND "current_period_end" >= "current_period_start"
      AND "plan_name" IS NOT NULL
      AND "price_monthly_paise" IS NOT NULL
    )
  )
);
