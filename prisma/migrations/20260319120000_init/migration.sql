-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "gym_status" AS ENUM ('setup_in_progress', 'pending', 'active');

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_key" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "owner_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,

    CONSTRAINT "owner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gyms" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "gym_status" NOT NULL DEFAULT 'setup_in_progress',
    "gym_name" TEXT,
    "address" TEXT,
    "contact" TEXT,
    "timing" TEXT,
    "logo_value" TEXT,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key_key" ON "user_accounts"("email_key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "owner_profiles_user_id_key" ON "owner_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gyms_owner_id_key" ON "gyms"("owner_id");

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lowercase only ASCII A-Z so the unique key matches the stored email case rule.
CREATE FUNCTION ascii_email_key(email text) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(
    email,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  );
$$;

ALTER TABLE "user_accounts"
  ADD CONSTRAINT "user_accounts_email_key_ascii_check"
  CHECK (email_key = ascii_email_key(email));
