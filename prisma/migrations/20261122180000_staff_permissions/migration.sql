-- CreateEnum
CREATE TYPE "staff_title" AS ENUM ('trainer', 'reception', 'accountant');

-- CreateTable
CREATE TABLE "role_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "can_view" BOOLEAN NOT NULL,
    "can_create" BOOLEAN NOT NULL,
    "can_manage" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "title" "staff_title" NOT NULL,
    "template_id" UUID NOT NULL,
    "can_view" BOOLEAN NOT NULL,
    "can_create" BOOLEAN NOT NULL,
    "can_manage" BOOLEAN NOT NULL,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "gym_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_templates_name_key" ON "role_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_user_id_key" ON "staff_members"("user_id");

-- CreateIndex
CREATE INDEX "staff_members_gym_id_idx" ON "staff_members"("gym_id");

-- CreateIndex
CREATE INDEX "audit_logs_gym_id_created_at_idx" ON "audit_logs"("gym_id", "created_at");

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "role_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "role_templates" ADD CONSTRAINT "role_templates_values_check" CHECK (
  "name" IN ('Owner', 'Manager', 'Staff')
  AND "sort_order" BETWEEN 1 AND 3
);

ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_name_check" CHECK (
  char_length("full_name") BETWEEN 1 AND 100
);

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shape_check" CHECK (
  (
    "target_type" = 'role_template'
    AND "gym_id" IS NULL
    AND "action" = 'template_updated'
  )
  OR (
    "target_type" = 'staff'
    AND "gym_id" IS NOT NULL
    AND "action" IN (
      'staff_created', 'staff_updated', 'staff_disabled', 'staff_enabled'
    )
  )
);
