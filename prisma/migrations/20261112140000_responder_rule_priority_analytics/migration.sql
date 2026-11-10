ALTER TABLE "ResponderRule"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ResponderInteraction"
  ADD COLUMN "matchedRuleId" TEXT,
  ADD COLUMN "noMatchingRule" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ResponderInteraction_userId_matchedRuleId_createdAt_idx"
  ON "ResponderInteraction"("userId", "matchedRuleId", "createdAt");
CREATE INDEX "ResponderInteraction_userId_noMatchingRule_createdAt_idx"
  ON "ResponderInteraction"("userId", "noMatchingRule", "createdAt");
