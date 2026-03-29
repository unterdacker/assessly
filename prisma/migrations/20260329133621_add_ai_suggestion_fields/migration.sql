-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findings" TEXT,
    "evidenceSnippet" TEXT,
    "isAiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiSuggestedStatus" TEXT,
    "manualNotes" TEXT,
    "evidenceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "AssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentAnswer" ("assessmentId", "createdAt", "createdBy", "evidenceSnippet", "evidenceUrl", "findings", "id", "manualNotes", "questionId", "status", "updatedAt") SELECT "assessmentId", "createdAt", "createdBy", "evidenceSnippet", "evidenceUrl", "findings", "id", "manualNotes", "questionId", "status", "updatedAt" FROM "AssessmentAnswer";
DROP TABLE "AssessmentAnswer";
ALTER TABLE "new_AssessmentAnswer" RENAME TO "AssessmentAnswer";
CREATE INDEX "AssessmentAnswer_assessmentId_questionId_idx" ON "AssessmentAnswer"("assessmentId", "questionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
