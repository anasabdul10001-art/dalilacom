-- Internal inactive plan used only to retain access for already-running legacy subscriptions.
-- It is never shown in the catalogue and is not assigned to accounts without a prior TRIAL/ACTIVE state.
INSERT INTO "ServicePlan" (
  "id", "service", "name", "description", "durationDays", "trialDays", "priceCents", "currency",
  "priceCredits", "monthlyBroadcastLimit", "includesAi", "aiReplyLimit", "removesBadge", "sortOrder",
  "isActive", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000001', 'RESPONDER_BASIC', 'اشتراك قديم محفوظ',
  'خطة داخلية لحفظ صلاحية الاشتراكات القائمة فقط؛ غير معروضة للبيع.', 30, 0, 0, 'USD', 0, NULL,
  true,
  COALESCE((SELECT ("value"->>'monthlyAiReplyLimit')::integer FROM "PlatformSetting" WHERE "key" = 'responder'), 500),
  false, -1000, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ResponderEntitlement" (
  "id", "userId", "planId", "status", "source", "trialEndsAt", "periodEnd", "createdAt", "updatedAt"
)
SELECT
  '00000000-0000-4000-8000-' || substr(md5(s."userId"), 1, 12),
  s."userId",
  '00000000-0000-4000-8000-000000000001',
  CASE WHEN s."status" = 'TRIAL' THEN 'TRIAL'::"ResponderEntitlementStatus" ELSE 'ACTIVE'::"ResponderEntitlementStatus" END,
  CASE WHEN s."status" = 'TRIAL' THEN 'TRIAL'::"ResponderEntitlementSource" ELSE 'PAID'::"ResponderEntitlementSource" END,
  s."trialEndsAt", s."periodEnd", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ResponderSubscription" s
WHERE s."status" IN ('TRIAL', 'ACTIVE')
ON CONFLICT ("userId", "planId") DO NOTHING;
