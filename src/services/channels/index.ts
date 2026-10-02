import { ChannelDriver } from "@prisma/client";
import { ChannelDriverImpl } from "./types";
import { telegramDriver } from "./telegram.driver";
import { webhookDriver } from "./webhook.driver";
import { facebookDriver, instagramDriver, metaPendingDriver } from "./meta.driver";

export const drivers: Record<ChannelDriver, ChannelDriverImpl> = {
  TELEGRAM: telegramDriver,
  GENERIC_WEBHOOK: webhookDriver,
  META_PENDING: metaPendingDriver,
  FACEBOOK: facebookDriver,
  INSTAGRAM: instagramDriver,
};
