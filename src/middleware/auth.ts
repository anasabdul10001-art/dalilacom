import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyAuthToken } from "../utils/jwt";
import { prisma } from "../prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, tokenVersion: true },
    });
    // tokenVersion mismatch means the user logged out (or reset their password) since this
    // token was issued — reject it even though the JWT signature itself is still valid.
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: "Token has been revoked, please log in again" });
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
