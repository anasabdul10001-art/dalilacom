import { Request } from "express";
import { Prisma, SecurityEventType } from "@prisma/client";
import { prisma } from "../prisma";

function clientIp(req?: Request): string | undefined {
  if (!req) return undefined;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? undefined;
}

/**
 * Records a security-relevant event (section: Security Events). Never pass passwords, raw
 * tokens, or JWTs in `metadata` — this table is meant to be safe to read by anyone
 * investigating an account, including future support tooling.
 */
export async function logSecurityEvent(params: {
  userId?: string | null;
  type: SecurityEventType;
  req?: Request;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.securityEvent.create({
    data: {
      userId: params.userId ?? null,
      type: params.type,
      ip: clientIp(params.req),
      userAgent: params.req?.headers["user-agent"]?.slice(0, 300),
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
