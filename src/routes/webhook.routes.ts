import { Router } from "express";
import { prisma } from "../prisma";
import { decryptJson } from "../services/crypto.service";
import { drivers } from "../services/channels";
import { handleIncoming } from "../services/responder.service";

export const webhookRouter = Router();

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
