-- CreateEnum
CREATE TYPE "FollowUpResponseStatus" AS ENUM ('coming', 'not_coming', 'custom');

-- CreateTable
CREATE TABLE "follow_up_response" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "follow_up_date" DATE NOT NULL,
    "status" "FollowUpResponseStatus" NOT NULL,
    "note" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_response_prescription_id_follow_up_date_idx" ON "follow_up_response"("prescription_id", "follow_up_date");

-- AddForeignKey
ALTER TABLE "follow_up_response" ADD CONSTRAINT "follow_up_response_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_response" ADD CONSTRAINT "follow_up_response_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
