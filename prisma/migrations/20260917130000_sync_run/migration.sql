-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "totalFromApi" INTEGER,
    "requestsMade" INTEGER NOT NULL,
    "pagesFetched" INTEGER NOT NULL,
    "subscribersSeen" INTEGER NOT NULL,
    "subscribersMatched" INTEGER NOT NULL,
    "profilesEnriched" INTEGER NOT NULL,
    "profileErrors" INTEGER NOT NULL,
    "ceilingHit" BOOLEAN NOT NULL DEFAULT false,
    "errorName" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_publicationId_startedAt_idx" ON "SyncRun"("publicationId", "startedAt");

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
