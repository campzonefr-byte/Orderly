-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "pictureUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "parentId" TEXT,
    "postId" TEXT NOT NULL,
    "postMessage" TEXT,
    "postPictureUrl" TEXT,
    "postType" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "authorPicture" TEXT,
    "message" TEXT NOT NULL,
    "detectedPhone" TEXT,
    "detectedName" TEXT,
    "detectedCity" TEXT,
    "detectedProduct" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "orderId" TEXT,
    "assignedTo" TEXT,
    "internalNote" TEXT,
    "repliedAt" TIMESTAMP(3),
    "replyText" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAccount_storeId_idx" ON "SocialAccount"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_storeId_platform_externalId_key" ON "SocialAccount"("storeId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialComment_externalId_key" ON "SocialComment"("externalId");

-- CreateIndex
CREATE INDEX "SocialComment_accountId_status_idx" ON "SocialComment"("accountId", "status");

-- CreateIndex
CREATE INDEX "SocialComment_postId_idx" ON "SocialComment"("postId");

-- CreateIndex
CREATE INDEX "SocialComment_postedAt_idx" ON "SocialComment"("postedAt");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
