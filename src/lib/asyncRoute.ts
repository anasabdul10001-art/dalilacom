import { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not catch a rejected promise: this hands it to the error middleware (which answers an ApiError properly). */
export const route =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
