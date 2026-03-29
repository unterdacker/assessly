/*
  Warnings:

  - A unique constraint covering the columns `[inviteToken]` on the table `Vendor` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "inviteTokenExpires" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_inviteToken_key" ON "Vendor"("inviteToken");
