CREATE TABLE "PlanOffer" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "paidPeriods" INTEGER NOT NULL,
  "bonusDays" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanOffer_planId_isActive_idx" ON "PlanOffer"("planId", "isActive");
ALTER TABLE "PlanOffer" ADD CONSTRAINT "PlanOffer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial monthly and annual catalog plans. Prices and converted wallet credits are seeded data;
-- future edits come from the admin catalogue. The conversion uses the platform's configured rate.
WITH settings AS (
  SELECT
    COALESCE((SELECT ("value"->>'trialDays')::integer FROM "PlatformSetting" WHERE "key" = 'responder'), 7) AS trial_days,
    COALESCE((SELECT ("value"->>'monthlyAiReplyLimit')::integer FROM "PlatformSetting" WHERE "key" = 'responder'), 500) AS ai_limit,
    COALESCE((SELECT "value"::text::numeric FROM "PlatformSetting" WHERE "key" = 'creditsPerUsd'), 100) AS credits_per_usd
), plans("id", "name", "durationDays", "priceCents", "sortOrder") AS (
  VALUES
    ('00000000-0000-4000-8000-000000000101', 'المجيب الآلي — شهري | Auto-responder — Monthly', 30, 500, 10),
    ('00000000-0000-4000-8000-000000000102', 'المجيب الآلي — سنوي | Auto-responder — Yearly', 365, 4800, 20)
)
INSERT INTO "ServicePlan" (
  "id", "service", "name", "description", "durationDays", "trialDays", "priceCents", "currency",
  "priceCredits", "monthlyBroadcastLimit", "includesAi", "aiReplyLimit", "removesBadge", "sortOrder",
  "isActive", "createdAt", "updatedAt"
)
SELECT p."id", 'RESPONDER_BASIC', p."name", 'اشتراك موحّد للمجيب الآلي | Unified auto-responder subscription',
  p."durationDays", s.trial_days, p."priceCents", 'USD', ROUND((p."priceCents"::numeric / 100) * s.credits_per_usd)::integer,
  NULL, true, s.ai_limit, false, p."sortOrder", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM plans p CROSS JOIN settings s
ON CONFLICT ("id") DO NOTHING;

WITH settings AS (
  SELECT COALESCE((SELECT ("value"->>'monthlyAiReplyLimit')::integer FROM "PlatformSetting" WHERE "key" = 'responder'), 500) AS ai_limit
)
INSERT INTO "PlanFeature" ("id", "planId", "text", "included", "sortOrder")
SELECT '00000000-0000-4000-8000-00000000010' || right(p."id", 1), p."id",
  'ردود ذكاء اصطناعي شهريًا: ' || s.ai_limit::text || ' | AI replies per month: ' || s.ai_limit::text, true, 1
FROM (VALUES
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000102')
) AS p("id") CROSS JOIN settings s
WHERE s.ai_limit > 0
ON CONFLICT ("id") DO NOTHING;
