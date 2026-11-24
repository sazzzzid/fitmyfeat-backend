-- CreateEnum
CREATE TYPE "message_channel" AS ENUM ('whatsapp', 'sms', 'push');

-- CreateEnum
CREATE TYPE "message_trigger" AS ENUM ('manual', 'expiry', 'payment', 'inactive');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "channel" "message_channel" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_automations" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "trigger" "message_trigger" NOT NULL,
    "template_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "gym_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "channel" "message_channel" NOT NULL,
    "trigger" "message_trigger" NOT NULL,
    "status" "message_status" NOT NULL,
    "failure_reason" TEXT,
    "body" TEXT NOT NULL,
    "sent_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_channel_name_key" ON "message_templates"("channel", "name");

-- CreateIndex
CREATE UNIQUE INDEX "gym_automations_gym_id_trigger_key" ON "gym_automations"("gym_id", "trigger");

-- CreateIndex
CREATE INDEX "messages_gym_id_created_at_idx" ON "messages"("gym_id", "created_at");

-- AddForeignKey
ALTER TABLE "gym_automations" ADD CONSTRAINT "gym_automations_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_automations" ADD CONSTRAINT "gym_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "messages_one_automation_per_day"
  ON "messages" ("gym_id", "member_id", "trigger", "sent_on")
  WHERE "trigger" <> 'manual';

ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_values_check" CHECK (
  char_length("name") BETWEEN 1 AND 64
  AND char_length("body") BETWEEN 1 AND 500
);

ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK (
  ("status" = 'sent' AND "failure_reason" IS NULL)
  OR ("status" = 'failed' AND "failure_reason" IS NOT NULL)
);

ALTER TABLE "gym_automations" ADD CONSTRAINT "gym_automations_trigger_check" CHECK (
  "trigger" IN ('expiry', 'payment', 'inactive')
);
