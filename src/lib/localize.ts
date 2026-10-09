import type { NextFunction, Request, Response } from "express";
import { DEFAULT_LANGUAGE, resolveLanguage } from "./languages";
import { localizeBody, translateHtml } from "../i18n";
import { arabicForError } from "../i18n/arErrors";

/**
 * Answers in the language the client asked for (?lang= or Accept-Language; Arabic when absent): the
 * `message` / `error.message` of JSON responses, and the text of server-made HTML pages. For Arabic readers
 * only an error written in English is changed (to its Arabic).
 */
export function localizeResponses(req: Request, res: Response, next: NextFunction) {
  const lang = resolveLanguage(req);
  if (lang === DEFAULT_LANGUAGE) {
    // an error the server wrote in English is shown in Arabic to an Arabic reader
    const arabic = res.json.bind(res);
    res.json = (body?: unknown) => {
      const error = (body as { error?: { code?: string; message?: string } } | undefined)?.error;
      const ar = error && typeof error === "object" ? arabicForError(String(error.code ?? ""), String(error.message ?? "")) : null;
      return arabic(ar ? { ...(body as object), error: { ...error, message: ar } } : body);
    };
    return next();
  }

  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(localizeBody(body, lang));

  const send = res.send.bind(res);
  // A page that already translated itself (invoices do, label by label) must not be translated again.
  res.send = (body?: unknown) =>
    send(typeof body === "string" && !res.locals.htmlLocalized && /^\s*<!doctype html/i.test(body) ? translateHtml(body, lang) : (body as never));
  next();
}
