import { Router } from "express";
import { z } from "zod";
import { NotificationMode, NotificationType } from "@prisma/client";
import { sendError, sendValidationError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  notifyExpiringMembership,
  setPreferences,
  unreadCount,
} from "../services/notification.service";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

// Inbox (section 13). Opening the list is also when a close-to-expiry membership reminder is
// produced, because there is no scheduler in this deployment.
notificationRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  await notifyExpiringMembership(userId).catch(() => null);
  const { items, unread } = await listNotifications(userId, {
    unreadOnly: req.query.unreadOnly === "true",
    take: req.query.take ? Number(req.query.take) : undefined,
    skip: req.query.skip ? Number(req.query.skip) : undefined,
  });
  res.json({ items, unread });
});

// Cheap enough to poll for the badge on every app foreground.
notificationRouter.get("/unread-count", async (req, res) => {
  res.json({ unread: await unreadCount(req.user!.id) });
});

notificationRouter.get("/preferences", async (req, res) => {
  res.json(await getPreferences(req.user!.id));
});

const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.nativeEnum(NotificationType),
        mode: z.nativeEnum(NotificationMode),
      }),
    )
    .min(1)
    .max(50),
});

notificationRouter.put("/preferences", async (req, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const duplicate = new Set(parsed.data.preferences.map((p) => p.type)).size !== parsed.data.preferences.length;
  if (duplicate) return sendError(res, 400, "BAD_REQUEST", "كل نوع إشعار مرة واحدة بس");
  res.json(await setPreferences(req.user!.id, parsed.data.preferences));
});

notificationRouter.post("/read-all", async (req, res) => {
  const result = await markAllRead(req.user!.id);
  res.json({ marked: result.count });
});

notificationRouter.post("/:id/read", async (req, res) => {
  const marked = await markRead(req.user!.id, req.params.id);
  // Same answer for "not mine", "already read" and "does not exist": nothing to leak either way.
  res.json({ marked });
});
