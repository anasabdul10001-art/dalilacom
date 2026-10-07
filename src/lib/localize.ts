import type { NextFunction, Request, Response } from "express";
import { DEFAULT_LANGUAGE, resolveLanguage } from "./languages";
import { localizeBody, translateHtml } from "../i18n";

/**
 * Answers in the language the client asked for (?lang= or Accept-Language; Arabic when absent): the
 * `message` / `error.message` of JSON responses, and the text of server-made HTML pages. Arabic readers
 * pay nothing — the middleware steps aside for them.
 */
export function localizeResponses(req: Request, res: Response, next: NextFunction) {
  const lang = resolveLanguage(req);
  if (lang === DEFAULT_LANGUAGE) return next();

  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(localizeBody(body, lang));

  const send = res.send.bind(res);
  // A page that already translated itself (invoices do, label by label) must not be translated again.
  res.send = (body?: unknown) =>
    send(typeof body === "string" && !res.locals.htmlLocalized && /^\s*<!doctype html/i.test(body) ? translateHtml(body, lang) : (body as never));
  next();
}
