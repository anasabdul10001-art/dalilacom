import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyAuthToken } from "../utils/jwt";
import { prisma } from "../prisma";
import { sendError } from "../lib/apiError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

/** What a business marketer may reach: the shop's discounts and its announcements (no ads, no money). */
function marketerMayUse(method: string, path: string): boolean {
  return /^\/merchant\/discounts(\/[^/]+)?$/.test(path) || /^\/broadcasts(\/preview)?$/.test(path) && ["GET", "POST"].includes(method.toUpperCase());
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return sendError(res, 401, "AUTH_MISSING_TOKEN", "Missing bearer token");
  }
  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, tokenVersion: true, isDisabled: true },
    });
    // tokenVersion mismatch means the user logged out (or reset their password) since this
    // token was issued — reject it even though the JWT signature itself is still valid.
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return sendError(res, 401, "AUTH_TOKEN_REVOKED", "Token has been revoked, please log in again");
    }
    // A disabled account must lose access immediately, even mid-session on an otherwise-valid token.
    if (user.isDisabled) {
      return sendError(res, 403, "ACCOUNT_DISABLED", "This account has been disabled");
    }
    req.user = { id: user.id, role: user.role };
    // a business marketer works on the owner's offers and announcements, and on nothing else
    const owner = req.headers["x-business-owner"];
    if (typeof owner === "string" && owner && owner !== user.id && marketerMayUse(req.method, req.originalUrl.split("?")[0])) {
      const staff = await prisma.businessStaff.findFirst({ where: { ownerId: owner, userId: user.id, role: "MARKETER", status: "ACTIVE" }, select: { id: true } });
      const boss = staff ? await prisma.user.findUnique({ where: { id: owner }, select: { id: true, role: true, isDisabled: true } }) : null;
      if (!staff || !boss || boss.isDisabled) return sendError(res, 403, "FORBIDDEN", "ما عندك صلاحية على هالنشاط");
      req.user = { id: boss.id, role: boss.role };
    }
    next();
  } catch {
    return sendError(res, 401, "AUTH_INVALID_TOKEN", "Invalid or expired token");
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, "FORBIDDEN", "Forbidden");
    }
    next();
  };
}
