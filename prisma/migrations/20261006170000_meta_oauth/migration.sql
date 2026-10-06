-- CreateTable
CREATE TABLE "MetaOAuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pagesEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaOAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaOAuthSession_userId_idx" ON "MetaOAuthSession"("userId");

-- AddForeignKey
ALTER TABLE "MetaOAuthSession" ADD CONSTRAINT "MetaOAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

