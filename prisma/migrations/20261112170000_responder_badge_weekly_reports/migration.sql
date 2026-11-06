ALTER TABLE "ResponderSubscription" ADD COLUMN "weeklyReportSentAt" TIMESTAMP(3);

-- Existing paid responder catalog plans should remove the free-plan attribution badge.
UPDATE "ServicePlan"
SET "removesBadge" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('responderBadge', '{"enabled":true,"text":"⚡ بواسطة دليلكم"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
