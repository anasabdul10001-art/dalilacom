import { Router } from "express";
import { ChannelDriver } from "@prisma/client";
import { prisma } from "../prisma";
import { sendError } from "../lib/apiError";
import { requireAuth } from "../middleware/auth";
import { getSubscription, isRunning } from "../services/responder.service";
import {
  appDeepLink,
  connectFromSession,
  createSession,
  exchangeCodeForPages,
  metaDialogUrl,
  metaOAuthConfigured,
  metaRedirectUri,
  metaScopes,
  MetaOAuthError,
  MetaPage,
  readSession,
  signPickerToken,
  verifyPickerToken,
  verifyState,
} from "../services/metaOAuth.service";

export const metaOAuthRouter = Router();

/** Same gate as the manual connect flow: the auto-responder has to be running to attach a Page. */
async function responderRunning(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  return isRunning(sub.status);
}

function page(title: string, body: string, deepLink?: string, autoRedirect = true): string {
  const link = deepLink
    ? `<p><a class="btn" href="${deepLink}">${autoRedirect ? "ارجع إلى تطبيق دليلكم" : "افتح تطبيق دليلكم لاختيار الصفحة"}</a></p>${
        autoRedirect ? `<script>setTimeout(function(){location.href=${JSON.stringify(deepLink)}},1200)</script>` : ""
      }`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#faf7f7;color:#1a1a1a;margin:0;padding:40px 16px;text-align:center}
.card{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
h2{color:#BA2A34;margin:0 0 8px}p{line-height:1.7;color:#444}
.btn{display:inline-block;margin-top:12px;background:#BA2A34;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700}
.pg{display:block;text-align:right;border:1px solid #eee;border-radius:12px;padding:14px;margin:10px 0}
.pg b{display:block;margin-bottom:8px}.pg a{margin-left:8px}
.muted{color:#888;font-size:13px}</style></head>
<body><div class="card"><h2>🅳 دليلكم</h2><p>${title}</p>${body}${link}</div></body></html>`;
}

/* ---------------- what the app asks before showing the button ---------------- */

metaOAuthRouter.get("/oauth/status", requireAuth, async (req, res) => {
  res.json({
    available: metaOAuthConfigured(),
    responderRunning: await responderRunning(req.user!.id),
    redirectUri: metaRedirectUri(),
    scopes: metaScopes(),
    deepLink: appDeepLink(),
  });
});

/* ---------------- step 1: the app opens this URL in a browser / Custom Tab ---------------- */

metaOAuthRouter.get("/oauth/start", requireAuth, async (req, res) => {
  if (!metaOAuthConfigured()) {
    return sendError(
      res,
      503,
      "META_NOT_CONFIGURED",
      "ربط فيسبوك مو مفعّل بعد — بدو تطبيق Meta Developer (META_APP_ID و META_APP_SECRET) وموافقة على الصلاحيات.",
    );
  }
  if (!(await responderRunning(req.user!.id))) {
    return sendError(res, 403, "FORBIDDEN", "فعّل المجيب الآلي أول (تجربة أو اشتراك)");
  }
  res.json({
    url: metaDialogUrl(req.user!.id),
    redirectUri: metaRedirectUri(),
    scopes: metaScopes(),
    expiresInMinutes: 15,
  });
});

/* ---------------- step 2: Facebook sends the merchant's browser back here ---------------- */

metaOAuthRouter.get("/oauth/callback", async (req, res) => {
  const userId = verifyState(typeof req.query.state === "string" ? req.query.state : undefined);
  if (!userId) {
    return res
      .status(400)
      .send(page("تعذّر إكمال الربط", "<p>رابط الرجوع غير صالح أو انتهت صلاحيته. ارجع للتطبيق وابدأ من جديد.</p>"));
  }

  if (typeof req.query.error === "string") {
    const reason = typeof req.query.error_description === "string" ? req.query.error_description : req.query.error;
    return res.status(400).send(page("تم إلغاء الربط", `<p>ما تم منح الصلاحية: ${reason}</p>`, appDeepLink({ ok: "0" })));
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) return res.status(400).send(page("تعذّر إكمال الربط", "<p>ما وصلنا كود التفويض من فيسبوك.</p>"));

  let pages: MetaPage[];
  try {
    pages = await exchangeCodeForPages(code);
  } catch (err) {
    const message = err instanceof MetaOAuthError ? err.message : "تعذّر الاتصال بفيسبوك";
    return res.status(502).send(page("تعذّر إكمال الربط", `<p>${message}</p>`, appDeepLink({ ok: "0" })));
  }

  if (pages.length === 0) {
    return res
      .status(400)
      .send(page("ما لقينا صفحات", "<p>حسابك ما فيه صفحات فيسبوك تديرها، أو ما منحت صلاحية الوصول لصفحاتك.</p>", appDeepLink({ ok: "0" })));
  }

  const sessionId = await createSession(userId, pages);

  // One Page: there is nothing to choose, so finish straight away.
  if (pages.length === 1) {
    try {
      const connection = await connectFromSession({ userId, sessionId, pageId: pages[0].id, driver: "FACEBOOK" });
      return res.send(
        page(`تم ربط «${pages[0].name}» ✅`, "<p>صار المجيب الآلي يرد على تعليقات ورسائل صفحتك.</p>", appDeepLink({ ok: "1", connectionId: connection.id })),
      );
    } catch (err) {
      const message = err instanceof MetaOAuthError ? err.message : "تعذّر ربط الصفحة";
      return res.status(400).send(page("تعذّر ربط الصفحة", `<p>${message}</p>`, appDeepLink({ ok: "0" })));
    }
  }

  // Several Pages: let the merchant pick, in the browser, with signed links.
  const rows = pages
    .map((p) => {
      const fb = `<a class="btn" href="/responder/meta/oauth/pick?session=${sessionId}&page=${p.id}&driver=FACEBOOK&sig=${signPickerToken(sessionId, p.id, "FACEBOOK")}">ربط الصفحة</a>`;
      const ig = p.instagramAccountId
        ? `<a class="btn" href="/responder/meta/oauth/pick?session=${sessionId}&page=${p.id}&driver=INSTAGRAM&sig=${signPickerToken(sessionId, p.id, "INSTAGRAM")}">ربط إنستغرام${p.instagramUsername ? ` (@${p.instagramUsername})` : ""}</a>`
        : "";
      return `<div class="pg"><b>${p.name}</b>${fb}${ig}</div>`;
    })
    .join("");

  res.send(
    page(
      "اختر الصفحة اللي بدك تربطها",
      `${rows}<p class="muted">الربط صالح 15 دقيقة. إذا ما لقيت صفحتك، تأكد إنك منحت صلاحية الوصول لصفحاتك.</p>`,
      // No auto-redirect here: the merchant may prefer to pick right here in the browser. The button
      // hands the session to the app so it can show its own picker instead.
      appDeepLink({ session: sessionId }),
      false,
    ),
  );
});

/* ---------------- step 3 (browser path): the merchant clicked one of the Pages ---------------- */

metaOAuthRouter.get("/oauth/pick", async (req, res) => {
  const sessionId = typeof req.query.session === "string" ? req.query.session : "";
  const pageId = typeof req.query.page === "string" ? req.query.page : "";
  const driver = (typeof req.query.driver === "string" ? req.query.driver : "FACEBOOK") as ChannelDriver;
  const sig = typeof req.query.sig === "string" ? req.query.sig : undefined;

  if (!sessionId || !pageId || !verifyPickerToken(sessionId, pageId, driver, sig)) {
    return res.status(400).send(page("رابط غير صالح", "<p>هالرابط مو موقّع أو انتهت صلاحيته. ارجع للتطبيق وابدأ من جديد.</p>"));
  }

  const owner = await sessionOwner(sessionId);
  if (!owner) {
    return res.status(400).send(page("انتهت صلاحية الربط", "<p>ارجع للتطبيق وابدأ الربط من جديد.</p>"));
  }
  if (!(await responderRunning(owner))) {
    return res.status(403).send(page("المجيب الآلي موقّف", "<p>فعّل المجيب الآلي من التطبيق ثم أعد المحاولة.</p>"));
  }

  try {
    const connection = await connectFromSession({ userId: owner, sessionId, pageId, driver });
    return res.send(page("تم الربط ✅", "<p>صار المجيب الآلي مربوطًا. ارجع للتطبيق لتشوف القناة.</p>", appDeepLink({ ok: "1", connectionId: connection.id })));
  } catch (err) {
    const message = err instanceof MetaOAuthError ? err.message : "تعذّر الربط";
    return res.status(400).send(page("تعذّر الربط", `<p>${message}</p>`, appDeepLink({ ok: "0" })));
  }
});

/** The owner of a (still usable) session, used by the browser path which has no app token. */
async function sessionOwner(sessionId: string): Promise<string | null> {
  const session = await prisma.metaOAuthSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, consumedAt: true, expiresAt: true },
  });
  if (!session || session.consumedAt || session.expiresAt.getTime() < Date.now()) return null;
  return session.userId;
}

/* ---------------- step 3 (app path): the app shows the picker itself ---------------- */

metaOAuthRouter.get("/oauth/session/:id", requireAuth, async (req, res) => {
  const pages = await readSession(req.params.id, req.user!.id);
  if (!pages) return sendError(res, 404, "SESSION_INVALID", "انتهت صلاحية الربط — ابدأ من جديد");
  res.json({
    sessionId: req.params.id,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      hasInstagram: Boolean(p.instagramAccountId),
      instagramUsername: p.instagramUsername ?? null,
    })),
  });
});

metaOAuthRouter.post("/oauth/complete", requireAuth, async (req, res) => {
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : "";
  const driver: ChannelDriver = req.body?.driver === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK";
  if (!sessionId || !pageId) return sendError(res, 400, "BAD_REQUEST", "sessionId و pageId مطلوبين");

  if (!(await responderRunning(req.user!.id))) {
    return sendError(res, 403, "FORBIDDEN", "فعّل المجيب الآلي أول (تجربة أو اشتراك)");
  }

  try {
    const connection = await connectFromSession({ userId: req.user!.id, sessionId, pageId, driver });
    res.status(201).json(connection);
  } catch (err) {
    if (err instanceof MetaOAuthError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
});
