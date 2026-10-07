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
import { registerDevice, unregisterDevice } from "../services/push.service";

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

// The phone's FCM token, so it can receive push notifications. Called after sign-in and whenever Firebase rotates the token.
const deviceSchema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios", "web"]).default("android") });

notificationRouter.post("/devices", async (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await registerDevice(req.user!.id, parsed.data.token, parsed.data.platform);
  res.status(201).json({ registered: true });
});

// Sign-out: stop pushing this account's notifications to this phone.
notificationRouter.delete("/devices", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(4096) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json({ removed: await unregisterDevice(req.user!.id, parsed.data.token) });
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
