import { Response } from "express";
import { ZodError } from "zod";

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Thrown from route handlers/services; caught by the global error middleware in server.ts. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

export function sendValidationError(res: Response, error: ZodError): Response {
  return sendError(res, 400, "VALIDATION_ERROR", "طلب غير صالح", error.flatten());
}
