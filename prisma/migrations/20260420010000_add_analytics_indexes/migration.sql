-- Migration: 20260420010000_add_analytics_indexes
-- Analytics: composite index for time-range queries (strictly within company)
CREATE INDEX "Assessment_companyId_createdAt_idx" ON "Assessment"("companyId", "createdAt");
