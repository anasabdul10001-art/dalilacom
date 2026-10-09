-- CreateTable
CREATE TABLE "AiUse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUse_userId_createdAt_idx" ON "AiUse"("userId", "createdAt");
