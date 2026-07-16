ALTER TABLE "WishlistItem" ADD COLUMN "mapUrl" TEXT;
ALTER TABLE "Goal" ADD COLUMN "mapUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN "mapUrl" TEXT;

CREATE TABLE "MemoryEntry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventTitle" TEXT NOT NULL,
  "eventStart" TIMESTAMP(3) NOT NULL,
  "thoughts" TEXT,
  "photoDataUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryEntry_workspaceId_eventKey_key" ON "MemoryEntry"("workspaceId", "eventKey");
CREATE INDEX "MemoryEntry_workspaceId_eventStart_idx" ON "MemoryEntry"("workspaceId", "eventStart");

ALTER TABLE "MemoryEntry"
ADD CONSTRAINT "MemoryEntry_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
