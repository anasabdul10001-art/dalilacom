ALTER TABLE "ResponderSubscription"
  ADD COLUMN "aiQuotaNotice80At" TIMESTAMP(3),
  ADD COLUMN "aiQuotaNotice100At" TIMESTAMP(3);

CREATE TABLE "ResponderAiCall" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(16,10),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResponderAiCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResponderAiCall_userId_createdAt_idx" ON "ResponderAiCall"("userId", "createdAt");
CREATE INDEX "ResponderAiCall_createdAt_provider_model_idx" ON "ResponderAiCall"("createdAt", "provider", "model");
ALTER TABLE "ResponderAiCall" ADD CONSTRAINT "ResponderAiCall_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
