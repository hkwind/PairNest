ALTER TABLE "CalendarConnection"
ADD COLUMN "accessToken" TEXT,
ADD COLUMN "refreshToken" TEXT,
ADD COLUMN "tokenType" TEXT,
ADD COLUMN "scope" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);
