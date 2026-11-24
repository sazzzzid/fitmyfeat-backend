-- AlterTable
ALTER TABLE "gyms" ADD COLUMN "contact_email" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "maps_url" TEXT;

-- CreateEnum
CREATE TYPE "branding_theme" AS ENUM ('neon', 'dark', 'light', 'classic');

-- CreateEnum
CREATE TYPE "branding_button_style" AS ENUM ('rounded', 'medium', 'square');

-- CreateTable
CREATE TABLE "gym_branding" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "theme" "branding_theme" NOT NULL,
    "primary_color" TEXT NOT NULL,
    "secondary_color" TEXT NOT NULL,
    "button_style" "branding_button_style" NOT NULL,

    CONSTRAINT "gym_branding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gym_branding_gym_id_key" ON "gym_branding"("gym_id");

-- AddForeignKey
ALTER TABLE "gym_branding" ADD CONSTRAINT "gym_branding_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gyms" ADD CONSTRAINT "gyms_optional_profile_check" CHECK (
  ("contact_email" IS NULL OR char_length("contact_email") BETWEEN 3 AND 254)
  AND ("description" IS NULL OR char_length("description") BETWEEN 1 AND 500)
  AND ("maps_url" IS NULL OR (
    char_length("maps_url") BETWEEN 9 AND 2048
    AND "maps_url" ~* '^https://'
  ))
);

ALTER TABLE "gym_branding" ADD CONSTRAINT "gym_branding_colors_check" CHECK (
  "primary_color" ~ '^#[0-9A-F]{6}$'
  AND "secondary_color" ~ '^#[0-9A-F]{6}$'
);
