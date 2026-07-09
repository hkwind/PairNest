CREATE TYPE "PartnerRole" AS ENUM ('A', 'B');
CREATE TYPE "EventSource" AS ENUM ('A', 'B', 'SHARED');
CREATE TYPE "CalendarEventKind" AS ENUM ('APP', 'PROVIDER_CACHE', 'ANNIVERSARY');

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'PairNest',
  "anniversary" TIMESTAMP(3),
  "colorUserA" TEXT NOT NULL DEFAULT '#01696f',
  "colorUserB" TEXT NOT NULL DEFAULT '#a13544',
  "colorShared" TEXT NOT NULL DEFAULT '#6f5ef9',
  "showAnniversary" BOOLEAN NOT NULL DEFAULT true,
  "syncAnniversary" BOOLEAN NOT NULL DEFAULT false,
  "anniversaryMode" TEXT NOT NULL DEFAULT 'monthly',
  "monthlyCount" INTEGER NOT NULL DEFAULT 24,
  "hundredDaysCount" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Partner" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "PartnerRole" NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WishlistItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "link" TEXT,
  "note" TEXT,
  "addedBy" TEXT NOT NULL DEFAULT 'Someone',
  "priority" TEXT NOT NULL DEFAULT 'Medium',
  "status" TEXT NOT NULL DEFAULT 'Saved',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Goal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'General',
  "targetDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'Planned',
  "owner" TEXT NOT NULL DEFAULT 'Both',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "start" TIMESTAMP(3) NOT NULL,
  "end" TIMESTAMP(3),
  "source" "EventSource" NOT NULL DEFAULT 'SHARED',
  "note" TEXT,
  "aCalendarEventId" TEXT,
  "bCalendarEventId" TEXT,
  "aSyncStatus" TEXT NOT NULL DEFAULT 'not_connected',
  "bSyncStatus" TEXT NOT NULL DEFAULT 'not_connected',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "PartnerRole" NOT NULL,
  "principalId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'google',
  "calendarId" TEXT NOT NULL,
  "calendarName" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarCache" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "PartnerRole" NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'google',
  "externalEventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "start" TIMESTAMP(3) NOT NULL,
  "end" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "calendarId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "Partner_workspaceId_role_key" ON "Partner"("workspaceId", "role");
CREATE INDEX "Partner_workspaceId_idx" ON "Partner"("workspaceId");
CREATE INDEX "WishlistItem_workspaceId_createdAt_idx" ON "WishlistItem"("workspaceId", "createdAt");
CREATE INDEX "Goal_workspaceId_createdAt_idx" ON "Goal"("workspaceId", "createdAt");
CREATE INDEX "Event_workspaceId_start_idx" ON "Event"("workspaceId", "start");
CREATE INDEX "Event_workspaceId_deletedAt_idx" ON "Event"("workspaceId", "deletedAt");
CREATE INDEX "CalendarConnection_workspaceId_role_active_idx" ON "CalendarConnection"("workspaceId", "role", "active");
CREATE UNIQUE INDEX "CalendarCache_workspaceId_role_provider_externalEventId_key" ON "CalendarCache"("workspaceId", "role", "provider", "externalEventId");
CREATE INDEX "CalendarCache_workspaceId_start_idx" ON "CalendarCache"("workspaceId", "start");

ALTER TABLE "Partner" ADD CONSTRAINT "Partner_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarCache" ADD CONSTRAINT "CalendarCache_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
