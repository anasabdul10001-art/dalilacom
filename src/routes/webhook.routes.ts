import { Router } from "express";
import { prisma } from "../prisma";
import { sendError } from "../lib/apiError";
import { decryptJson } from "../services/crypto.service";
import { drivers } from "../services/channels";
import { parseMetaWebhook, verifyMetaSignature } from "../services/channels/meta.driver";
import { handleIncoming } from "../services/responder.service";

export const webhookRouter = Router();

// Meta (Facebook + Instagram) uses ONE app-level webhook for every connected page, not a per-connection URL.
// Step 1 — subscription handshake: Meta calls this once with a challenge when the webhook is saved in the dashboard.
webhookRouter.get("/meta", (req, res) => {
  const expected = process.env.META_VERIFY_TOKEN;
  if (expected && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === expected) {
    return res.status(200).type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  }
  return sendError(res, 403, "FORBIDDEN", "Verification failed");
});

// Step 2 — deliveries. Every body is signed with the app secret; unsigned/mis-signed requests are refused.
webhookRouter.post("/meta", async (req, res) => {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return sendError(res, 503, "SERVICE_UNAVAILABLE", "Meta app secret is not configured");
  if (!verifyMetaSignature((req as any).rawBody, req.headers["x-hub-signature-256"] as string | undefined, secret)) {
    return sendError(res, 401, "AUTH_INVALID_SIGNATURE", "Invalid signature");
  }

  for (const event of parseMetaWebhook(req.body)) {
    try {
      const connection = await prisma.channelConnection.findFirst({
        where: {
          externalAccountId: event.accountId,
          isActive: true,
          channel: { isEnabled: true, driver: { in: ["FACEBOOK", "INSTAGRAM"] } },
        },
        include: { channel: true },
      });
      if (connection) await handleIncoming(connection, event.message);
    } catch (err) {
      // One bad event must not make Meta retry (and re-send) the whole batch.
      console.error("Meta webhook event failed:", err instanceof Error ? err.message : err);
    }
  }
  res.status(200).json({ ok: true });
});

// Public endpoint platforms call with new customer messages. The unguessable hookToken in the path identifies
// the connection; each driver also checks its own secret, so a leaked URL alone isn't enough.
webhookRouter.post("/:hookToken", async (req, res) => {
  const connection = await prisma.channelConnection.findUnique({
    where: { hookToken: req.params.hookToken },
    include: { channel: true },
  });
  // Always answer 200 quickly so the platform doesn't retry; failures are recorded in the inbox instead.
  if (!connection || !connection.isActive || !connection.channel.isEnabled) return res.status(200).json({ ok: true });

  const driver = drivers[connection.channel.driver];
  const msg = driver.parseIncoming(req.body, req.headers, {
    credentials: decryptJson(connection.credentialsEnc),
    hookToken: connection.hookToken,
    channelConfig: connection.channel.config as Record<string, any>,
  });
  if (!msg) return res.status(200).json({ ok: true });

  await handleIncoming(connection, msg);
  res.status(200).json({ ok: true });
});
