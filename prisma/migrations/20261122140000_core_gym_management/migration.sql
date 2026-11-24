-- CreateEnum
CREATE TYPE "membership_state" AS ENUM ('active', 'frozen');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_products" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "status" "membership_state" NOT NULL DEFAULT 'active',
    "product_name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "frozen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_gym_id_idx" ON "members"("gym_id");

-- CreateIndex
CREATE INDEX "membership_products_gym_id_idx" ON "membership_products"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_member_id_key" ON "memberships"("member_id");

-- CreateIndex
CREATE INDEX "memberships_gym_id_idx" ON "memberships"("gym_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_products" ADD CONSTRAINT "membership_products_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "membership_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "members" ADD CONSTRAINT "members_values_check" CHECK (
  char_length("full_name") BETWEEN 1 AND 100
  AND char_length("contact") BETWEEN 1 AND 254
  AND ("notes" IS NULL OR char_length("notes") <= 1000)
);

ALTER TABLE "membership_products" ADD CONSTRAINT "membership_products_values_check" CHECK (
  char_length("name") BETWEEN 1 AND 64
  AND "price_paise" >= 0
  AND "duration_days" BETWEEN 1 AND 3650
);

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_state_check" CHECK (
  "current_period_end" >= "current_period_start"
  AND "duration_days" BETWEEN 1 AND 3650
  AND "price_paise" >= 0
  AND (
    ("status" = 'active' AND "frozen_at" IS NULL)
    OR ("status" = 'frozen' AND "frozen_at" IS NOT NULL)
  )
);
