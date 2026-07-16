-- CreateEnum
CREATE TYPE "SessionRevokeReason" AS ENUM ('logout', 'superseded', 'deactivated');

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "revoked_reason" "SessionRevokeReason";

-- CreateIndex
CREATE UNIQUE INDEX "session_refresh_token_hash_key" ON "session"("refresh_token_hash");
