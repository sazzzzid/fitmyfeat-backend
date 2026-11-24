-- AlterTable
ALTER TABLE "members" ADD COLUMN "left_at" TIMESTAMPTZ(3);

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'upi', 'card');

-- CreateEnum
CREATE TYPE "membership_action" AS ENUM ('assign', 'renew', 'switch');

-- CreateTable
CREATE TABLE "membership_payments" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "action" "membership_action" NOT NULL,
    "list_price_paise" INTEGER NOT NULL,
    "amount_received_paise" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "payment_method" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_payments_membership_id_idx" ON "membership_payments"("membership_id");

-- CreateIndex
CREATE INDEX "membership_payments_gym_id_idx" ON "membership_payments"("gym_id");

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "membership_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_amounts_check" CHECK (
  "list_price_paise" >= 0
  AND "amount_received_paise" >= 0
);
