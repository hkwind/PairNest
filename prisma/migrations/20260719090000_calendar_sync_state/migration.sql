CREATE TABLE "CalendarSyncState" (
  "workspaceId" TEXT NOT NULL,
  "runningUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "lastCompletedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarSyncState_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "CalendarSyncState"
ADD CONSTRAINT "CalendarSyncState_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
