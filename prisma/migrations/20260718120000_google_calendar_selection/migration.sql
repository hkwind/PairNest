CREATE TABLE "CalendarOAuthSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "PartnerRole" NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "tokenType" TEXT,
  "scope" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresOn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarOAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarOAuthSession_workspaceId_expiresOn_idx" ON "CalendarOAuthSession"("workspaceId", "expiresOn");

ALTER TABLE "CalendarOAuthSession"
ADD CONSTRAINT "CalendarOAuthSession_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
