-- CreateTable
CREATE TABLE "VendorSmsLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorSmsLog_phoneHash_sentAt_idx" ON "VendorSmsLog"("phoneHash", "sentAt");

-- CreateIndex
CREATE INDEX "VendorSmsLog_vendorId_sentAt_idx" ON "VendorSmsLog"("vendorId", "sentAt");
