-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "substackId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cookieCiphertext" BYTEA NOT NULL,
    "cookieValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "substackUserId" TEXT,
    "handle" TEXT,
    "displayName" TEXT,
    "emailCiphertext" BYTEA,
    "emailHash" TEXT,
    "subscribedAt" TIMESTAMP(3),

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberSnapshot" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "subscriberCount" INTEGER,
    "bestsellerStatus" TEXT,
    "activityRating" INTEGER,
    "source" TEXT NOT NULL,

    CONSTRAINT "SubscriberSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_substackId_key" ON "Publication"("substackId");

-- CreateIndex
CREATE INDEX "Publication_subdomain_idx" ON "Publication"("subdomain");

-- CreateIndex
CREATE INDEX "Subscriber_publicationId_idx" ON "Subscriber"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_publicationId_substackUserId_key" ON "Subscriber"("publicationId", "substackUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_publicationId_emailHash_key" ON "Subscriber"("publicationId", "emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_publicationId_handle_key" ON "Subscriber"("publicationId", "handle");

-- CreateIndex
CREATE INDEX "SubscriberSnapshot_subscriberId_capturedAt_idx" ON "SubscriberSnapshot"("subscriberId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberSnapshot_subscriberId_capturedAt_key" ON "SubscriberSnapshot"("subscriberId", "capturedAt");

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberSnapshot" ADD CONSTRAINT "SubscriberSnapshot_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

