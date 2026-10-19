import { DEFAULT_LANGUAGE } from "../lib/languages";
import { translateText } from "../i18n";
import { pushStatus, sendPushToUser } from "../services/push.service";
import express, { Router } from "express";
import { z } from "zod";
import { ChannelDriver, Prisma, Role, TopUpStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError, sendError, sendValidationError } from "../lib/apiError";
import { requireAuth, requireRole } from "../middleware/auth";
import { addDemoStore, removeDemoStore } from "../services/demoStore.service";
import { adState, approveAd, linkBannerToBooking, markBannerContacted, rejectAd, rejectBannerBooking } from "../services/ads.service";
import { copyCreativeToBanner, creativeIds, getCreative } from "../services/adCreative.service";
import { visionAvailable } from "../services/ai.service";
import { notify } from "../services/notification.service";
import { discountScopeInfo, discountState } from "../lib/discounts";
import { sniffImageMime } from "../lib/image";
import { route } from "../lib/asyncRoute";
import { getSettings, saveSettings } from "../services/settings.service";
import { AppReleaseError, getAppDownloadInfo, getAppUpdate, setAppUpdate, MAX_APK_BYTES, saveAppRelease, setAppDownloadVisible } from "../services/appRelease.service";
import { adminOverview } from "../services/adminStats.service";
import { adminClaims, approveClaim, askForInfo, claimFile, rejectClaim } from "../services/landmarkClaim.service";
import { adminList, createKind, createLandmark, deleteLandmark, importFromOsm, LandmarkError, listKinds, reviewLandmarks, updateKind, updateLandmark } from "../services/landmark.service";
import { getSocialLinks, saveSocialLinks, SOCIAL_PLATFORMS, SocialLinkError } from "../services/socialLinks.service";
import { adjustBalance, InsufficientBalanceError } from "../services/wallet.service";
import { aiProviderStatus, aiTotals, aiUsage, testProvider } from "../services/ai.service";
import bcrypt from "bcryptjs";
import { eraseAccount } from "../services/accountDeletion.service";
import { previewLaunchReset, resetEnabled, RESET_PHRASE, runLaunchReset } from "../services/launchReset.service";
import { isSupportedLanguage } from "../lib/languages";
import { editPhotoWithAi, imageEditAvailable, lastImageEditError } from "../services/aiImage.service";
import sharp from "sharp";
import { invalidateProductCategories } from "../services/productCategory.service";
import { decideProduct } from "../services/productModeration.service";
import { createMarketer, decideMarketerRequest, listMarketerRequests, listMarketers, updateMarketer } from "../services/referral.service";
import { approveSuggestion, listSuggestions, mergeSuggestion, rejectSuggestion } from "../services/categorySuggestion.service";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN));

/* ---------------- the home page: numbers and what is waiting ---------------- */

adminRouter.get("/overview", route(async (_req, res) => {
  res.json(await adminOverview());
}));

/* ---------------- public places on the map (mosques, hospitals, parks, main streets) ---------------- */

const landmarkBody = z.object({
  kindId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(600).nullable().optional(),
  sector: z.enum(["PUBLIC", "PRIVATE"]).nullable().optional(),
  status: z.enum(["PENDING_REVIEW", "ACTIVE", "HIDDEN"]).optional(),
  cityId: z.string().uuid().nullable().optional(),
  address: z.string().trim().max(250).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  path: z.array(z.array(z.tuple([z.number(), z.number()])).max(400)).max(40).nullable().optional(),
});
const kindBody = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,30}$/).optional(),
  nameAr: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  geometry: z.enum(["POINT", "LINE"]),
  claimable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

function landmarkFail(res: import("express").Response, err: unknown) {
  if (err instanceof LandmarkError) {
    const code = err.status === 409 ? "CONFLICT" : err.status === 404 ? "NOT_FOUND" : err.status === 502 ? "UPSTREAM" : "BAD_REQUEST";
    return res.status(err.status).json({ error: { code, message: err.message, details: err.extra } });
  }
  throw err;
}

adminRouter.get("/landmark-kinds", route(async (_req, res) => {
  res.json({ kinds: await listKinds(false) });
}));

adminRouter.post("/landmark-kinds", route(async (req, res) => {
  const parsed = kindBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!parsed.data.slug) return sendError(res, 400, "BAD_REQUEST", "Write a short English name for the kind");
  try {
    res.status(201).json(await createKind({ ...parsed.data, slug: parsed.data.slug }));
  } catch (err) { landmarkFail(res, err); }
}));

adminRouter.patch("/landmark-kinds/:id", route(async (req, res) => {
  const parsed = kindBody.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await updateKind(req.params.id, parsed.data));
  } catch (err) { landmarkFail(res, err); }
}));

adminRouter.get("/landmarks", route(async (req, res) => {
  const parsed = z.object({ status: z.enum(["PENDING_REVIEW", "ACTIVE", "HIDDEN", "CLAIMED"]).optional(), kind: z.string().max(40).optional(), q: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await adminList(parsed.data));
}));

adminRouter.post("/landmarks", route(async (req, res) => {
  const parsed = landmarkBody.extend({ force: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { force, ...data } = parsed.data;
  try {
    res.status(201).json(await createLandmark(data, !!force));
  } catch (err) { landmarkFail(res, err); }
}));

adminRouter.patch("/landmarks/:id", route(async (req, res) => {
  const parsed = landmarkBody.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await updateLandmark(req.params.id, parsed.data));
  } catch (err) { landmarkFail(res, err); }
}));

// approve / hide / delete many places at once: by ids, or "everything of this kind in this state"
adminRouter.post("/landmarks/review", route(async (req, res) => {
  const parsed = z.object({
    action: z.enum(["approve", "hide", "delete"]),
    ids: z.array(z.string().uuid()).max(500).optional(),
    filter: z.object({ status: z.enum(["PENDING_REVIEW", "ACTIVE", "HIDDEN"]).optional(), kind: z.string().max(40).optional() }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await reviewLandmarks(parsed.data));
  } catch (err) { landmarkFail(res, err); }
}));

// fetch the places around a point from OpenStreetMap into the review list
adminRouter.post("/landmarks/import", route(async (req, res) => {
  const parsed = z.object({
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    radiusKm: z.number().min(0.5).max(25), kinds: z.array(z.string().max(30)).min(1).max(10),
    cityId: z.string().uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await importFromOsm(parsed.data));
  } catch (err) { landmarkFail(res, err); }
}));

adminRouter.delete("/landmarks/:id", route(async (req, res) => {
  try {
    await deleteLandmark(req.params.id);
    res.status(204).end();
  } catch (err) { landmarkFail(res, err); }
}));

/* ---------------- claims: a private place's owner asking to take it over ---------------- */

adminRouter.get("/landmark-claims", route(async (req, res) => {
  const parsed = z.object({ status: z.enum(["PENDING", "NEEDS_INFO", "APPROVED", "REJECTED", "WITHDRAWN"]).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await adminClaims(parsed.data));
}));

// a proof photo, for the admin's eyes
adminRouter.get("/landmark-claims/files/:fileId", route(async (req, res) => {
  const f = await claimFile(req.params.fileId);
  if (!f) return sendError(res, 404, "NOT_FOUND", "Place not found");
  res.set({ "Content-Type": f.mime, "Cache-Control": "private, no-store" });
  res.end(Buffer.from(f.data));
}));

adminRouter.post("/landmark-claims/:id/approve", route(async (req, res) => {
  const parsed = z.object({ categoryId: z.string().uuid().nullable().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try { res.json(await approveClaim(req.params.id, req.user!.id, parsed.data)); } catch (err) { landmarkFail(res, err); }
}));

adminRouter.post("/landmark-claims/:id/reject", route(async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3).max(400) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try { await rejectClaim(req.params.id, req.user!.id, parsed.data.reason); res.json({ ok: true }); } catch (err) { landmarkFail(res, err); }
}));

adminRouter.post("/landmark-claims/:id/needs-info", route(async (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(3).max(400) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try { await askForInfo(req.params.id, req.user!.id, parsed.data.message); res.json({ ok: true }); } catch (err) { landmarkFail(res, err); }
}));

/* ---------------- platform settings (pricing, trial, credit, payment accounts) ---------------- */

const settingsSchema = z.object({
  creditName: z.string().min(1).max(40).optional(),
  creditsPerUsd: z.number().positive().optional(),
  responder: z
    .object({
      priceCustomer: z.number().int().nonnegative(),
      priceMerchant: z.number().int().nonnegative(),
      periodDays: z.number().int().positive(),
      trialDays: z.number().int().nonnegative(),
      monthlyAiReplyLimit: z.number().int().nonnegative(),
    })
    .partial()
    .optional(),
  broadcasts: z
    .object({
      merchantDefaultMonthly: z.number().int().nonnegative().max(100000),
      maxRadiusKm: z.number().positive().max(20000),
      merchantMaxAudience: z.number().int().positive().max(1000000),
      pricePerAnnouncement: z.number().int().nonnegative().max(10000000),
    })
    .partial()
    .optional(),
  ads: z
    .object({
      packages: z.array(z.object({ days: z.number().int().min(1).max(365), credits: z.number().int().nonnegative().max(100000000) })).max(12),
      bannerPackages: z.array(z.object({ days: z.number().int().min(1).max(365), credits: z.number().int().nonnegative().max(100000000) })).max(12),
      autoApprove: z.boolean(),
      bannerSeconds: z.number().int().min(2).max(60),
    })
    .partial()
    .optional(),
  referral: z
    .object({
      marketerPercent: z.number().min(0).max(100),
      marketerSignupCredits: z.number().int().nonnegative().max(100000000),
      managerPercent: z.number().min(0).max(100),
      managerSignupCredits: z.number().int().nonnegative().max(100000000),
    })
    .partial()
    .optional(),
  ai: z
    .object({
      freePerMonth: z.number().int().nonnegative().max(1000000),
      creditsPerUse: z.number().int().nonnegative().max(10000000),
      packages: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]{2,30}$/),
            name: z.string().trim().min(2).max(40),
            days: z.number().int().min(1).max(365),
            uses: z.number().int().min(1).max(1000000),
            credits: z.number().int().nonnegative().max(100000000),
          }),
        )
        .max(8),
    })
    .partial()
    .optional(),
  payment: z
    .object({
      usdtTrc20Address: z.string().trim().regex(/^(T[1-9A-HJ-NP-Za-km-z]{33})?$/, "عنوان TRON غير صالح").optional(),
      localWallets: z
        .array(
          z.object({
            key: z.string().regex(/^[A-Z0-9_]{2,30}$/),
            label: z.string().min(1),
            accountNumber: z.string().min(1),
            instructions: z.string().optional(),
          }),
        )
        .optional(),
      sypPerUsd: z.number().min(0).max(100000000).optional(),
    })
    .optional(),
});

/* ---------------- professions the shops proposed ---------------- */

adminRouter.get("/category-suggestions", route(async (req, res) => {
  const status = z.enum(["PENDING", "APPROVED", "MERGED", "REJECTED"]).catch("PENDING").parse(req.query.status);
  res.json(await listSuggestions(status));
}));

const approveSuggestionSchema = z.object({
  nameAr: z.string().trim().min(2).max(60),
  nameEn: z.string().trim().max(80).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(8).nullable().optional(),
  synonyms: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});

adminRouter.post("/category-suggestions/:id/approve", route(async (req, res) => {
  const parsed = approveSuggestionSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await approveSuggestion(req.params.id, parsed.data));
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
}));

adminRouter.post("/category-suggestions/:id/merge", route(async (req, res) => {
  const parsed = z.object({ categoryId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await mergeSuggestion(req.params.id, parsed.data.categoryId));
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
}));

adminRouter.post("/category-suggestions/:id/reject", route(async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().max(200).default("") }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    await rejectSuggestion(req.params.id, parsed.data.reason);
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    throw err;
  }
  res.json({ ok: true });
}));

adminRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

adminRouter.put("/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const keys = parsed.data.payment?.localWallets?.map((w) => w.key) ?? [];
  if (new Set(keys).size !== keys.length || keys.includes("USDT_TRC20")) {
    return sendError(res, 400, "BAD_REQUEST", "مفاتيح المحافظ لازم تكون فريدة ومو USDT_TRC20");
  }
  res.json(await saveSettings(parsed.data as any));
});

/* ---------------- our own social media links: address + show/hide for each ---------------- */

adminRouter.get("/social-links", route(async (_req, res) => {
  res.json({ links: await getSocialLinks() });
}));

const socialLinksSchema = z.object({
  links: z.array(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: z.string().max(300), visible: z.boolean() })).max(SOCIAL_PLATFORMS.length),
});

adminRouter.put("/social-links", route(async (req, res) => {
  const parsed = socialLinksSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json({ links: await saveSocialLinks(parsed.data.links) });
  } catch (err) {
    if (err instanceof SocialLinkError) {
      return sendError(res, 400, "BAD_REQUEST", err.message === "WRONG_DOMAIN" ? "The link is not on this platform's own website" : "The link is not a valid web address");
    }
    throw err;
  }
}));

/* ---------------- the Android app as a file on the website: upload each new version here, switch the link on or off ---------------- */

adminRouter.get("/app-download", route(async (_req, res) => {
  res.json(await getAppDownloadInfo());
}));

// The file is sent as it is (not JSON): PUT /admin/app-download/file?version=0.1.3 with the .apk as the body.
adminRouter.put("/app-download/file", express.raw({ type: () => true, limit: MAX_APK_BYTES }), route(async (req, res) => {
  const version = typeof req.query.version === "string" ? req.query.version : "";
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  try {
    await saveAppRelease(body, version);
  } catch (err) {
    if (err instanceof AppReleaseError) {
      const text: Record<string, string> = {
        BAD_SIZE: "The file is empty or too big",
        NOT_APK: "This file is not an Android app (.apk)",
        BAD_VERSION: "Write the version like 0.1.3",
      };
      return sendError(res, 400, "BAD_REQUEST", text[err.message] ?? "The file was refused");
    }
    throw err;
  }
  res.json(await getAppDownloadInfo());
}));

adminRouter.get("/app-update", route(async (_req, res) => {
  res.json(await getAppUpdate());
}));

adminRouter.put("/app-update", route(async (req, res) => {
  const parsed = z.object({ version: z.string().max(20), notify: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.json(await setAppUpdate(parsed.data));
  } catch (err) {
    if (err instanceof AppReleaseError) return sendError(res, 400, "BAD_REQUEST", "Write the version like 0.1.6");
    throw err;
  }
}));

adminRouter.put("/app-download/visible", route(async (req, res) => {
  const parsed = z.object({ visible: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    await setAppDownloadVisible(parsed.data.visible);
  } catch (err) {
    if (err instanceof AppReleaseError) return sendError(res, 400, "BAD_REQUEST", "Upload the app file first");
    throw err;
  }
  res.json(await getAppDownloadInfo());
}));

/* ---------------- marketers: people who bring others to Dalilacom through a referral link ---------------- */

const optPercent = z.number().min(0).max(100).nullable().optional();
const optCredits = z.number().int().nonnegative().max(100000000).nullable().optional();
const marketerBase = { kind: z.enum(["MANAGER", "MARKETER"]), channel: z.enum(["ELECTRONIC", "FIELD"]).optional(), parentId: z.string().uuid().nullable().optional(), percent: optPercent, signupCredits: optCredits, teamPercent: optPercent, teamSignupCredits: optCredits };

adminRouter.get("/marketers", route(async (_req, res) => {
  res.json({ marketers: await listMarketers() });
}));

/* ---- Starting from zero for the launch: closed unless ALLOW_DATA_RESET=yes is set on the server; needs the admin's password and a typed phrase ---- */
adminRouter.get("/launch-reset", route(async (_req, res) => {
  res.json({ ...(await previewLaunchReset()), phrase: RESET_PHRASE });
}));

adminRouter.post("/launch-reset", route(async (req, res) => {
  if (!resetEnabled()) return sendError(res, 403, "FORBIDDEN", "The reset is closed: set ALLOW_DATA_RESET=yes on the server and try again");
  const parsed = z.object({ phrase: z.string(), password: z.string().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (parsed.data.phrase.trim() !== RESET_PHRASE) return sendError(res, 400, "BAD_REQUEST", "The confirmation phrase is wrong");
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, passwordHash: true } });
  if (!me || !(await bcrypt.compare(parsed.data.password, me.passwordHash))) return sendError(res, 403, "FORBIDDEN", "The password is wrong");
  const superEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  if (superEmail && me.email.toLowerCase() !== superEmail) return sendError(res, 403, "FORBIDDEN", "Only the super admin account can reset the data");
  res.json({ ok: true, ...(await runLaunchReset()) });
}));

adminRouter.get("/marketer-requests", route(async (req, res) => {
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).catch("PENDING").parse(req.query.status);
  res.json({ requests: await listMarketerRequests(status) });
}));

adminRouter.post("/marketer-requests/:id/approve", route(async (req, res) => {
  const parsed = z.object({ kind: z.enum(["MANAGER", "MARKETER"]).optional(), parentId: z.string().uuid().nullable().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await decideMarketerRequest(String(req.params.id), true, parsed.data);
  res.json({ ok: true });
}));

adminRouter.post("/marketer-requests/:id/reject", route(async (req, res) => {
  await decideMarketerRequest(String(req.params.id), false);
  res.json({ ok: true });
}));

adminRouter.post("/marketers", route(async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email(), ...marketerBase }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await createMarketer(parsed.data);
  res.status(201).json({ id: row.id, code: row.code });
}));

adminRouter.patch("/marketers/:id", route(async (req, res) => {
  const parsed = z.object({ ...marketerBase, isActive: z.boolean().optional() }).partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await updateMarketer(String(req.params.id), parsed.data);
  res.json({ ok: true });
}));

/* ---------------- accounts: who is who, and switching one off ---------------- */

const USERS_PAGE = 50; // the list shows 50 accounts a page
const usersQuerySchema = z.object({ q: z.string().trim().max(80).optional(), role: z.nativeEnum(Role).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) });

adminRouter.get("/users", async (req, res) => {
  const parsed = usersQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { q, role, page } = parsed.data;
  const where = {
    ...(role ? { role } : {}),
    ...(q
      ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, email: true, fullName: true, phone: true, role: true, isDisabled: true, isEmailVerified: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * USERS_PAGE,
      take: USERS_PAGE,
    }),
  ]);
  // the list itself stays a plain array; the total and the page size ride in headers
  res.set({ "X-Total-Count": String(total), "X-Page-Size": String(USERS_PAGE) });
  res.json(users);
});

const userId = (id: string) => ({ id });

/** Everything about one account, for the admin's edit window. */
adminRouter.get("/users/:id", route(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: userId(req.params.id),
    select: {
      id: true, email: true, fullName: true, phone: true, role: true, isDisabled: true, isEmailVerified: true, bio: true, language: true,
      countryCode: true, vatNumber: true, createdAt: true, updatedAt: true,
      wallet: { select: { balance: true } },
      merchantProfile: { select: { id: true, businessName: true, approvalStatus: true } },
      _count: { select: { orders: true, memberships: true } },
    },
  });
  if (!user) return sendError(res, 404, "NOT_FOUND", "User not found");
  const { wallet, _count, ...rest } = user;
  res.json({ ...rest, walletBalance: wallet?.balance ?? 0, ordersCount: _count.orders, membershipsCount: _count.memberships });
}));

const editUserSchema = z.object({
  isDisabled: z.boolean().optional(),
  fullName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .refine((value) => value === "" || /^\+?\d{6,15}$/.test(value), "Invalid phone number")
    .nullable()
    .optional(),
  role: z.enum(["CUSTOMER", "MERCHANT"]).optional(), // a promotion to admin is made only through the server settings
  isEmailVerified: z.boolean().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  language: z.string().refine(isSupportedLanguage, "unsupported language").optional(),
  countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
  vatNumber: z.string().trim().max(30).nullable().optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

// Edit any detail of an account, switch it off (or back on), or set a new password. Switching an account off, changing its
// email or password ends its sessions. An admin can't switch off their own account, so at least one enabled admin always
// remains. An admin account is protected: only its owner may edit it, and its role is not changed from here.
adminRouter.patch("/users/:id", route(async (req, res) => {
  const parsed = editUserSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const input = parsed.data;
  const target = await prisma.user.findUnique({ where: userId(req.params.id), select: { id: true, role: true, email: true } });
  if (!target) return sendError(res, 404, "NOT_FOUND", "User not found");
  // an admin account is protected: no other admin can change its role or any of its details
  if (target.role === "ADMIN" && target.id !== req.user!.id) return sendError(res, 403, "FORBIDDEN", "An admin account can only be changed by its owner");
  if (input.isDisabled && target.id === req.user!.id) return sendError(res, 409, "CONFLICT", "You cannot disable your own account");
  if (input.role && target.role === "ADMIN") return sendError(res, 409, "CONFLICT", "An admin account's role cannot be changed here");
  if (input.email && input.email !== target.email) {
    if (await prisma.user.findFirst({ where: { email: input.email, id: { not: target.id } }, select: { id: true } })) return sendError(res, 409, "CONFLICT", "That email is already used by another account");
  }
  if (input.phone) {
    if (await prisma.user.findFirst({ where: { phone: input.phone, id: { not: target.id } }, select: { id: true } })) return sendError(res, 409, "CONFLICT", "That phone number is already used by another account");
  }
  const { newPassword, phone, ...rest } = input;
  const endSessions = input.isDisabled === true || newPassword !== undefined || (input.email !== undefined && input.email !== target.email);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...rest,
      ...(phone !== undefined ? { phone: phone === "" ? null : phone } : {}),
      ...(input.email !== undefined && input.email !== target.email && input.isEmailVerified === undefined ? { isEmailVerified: false } : {}),
      ...(newPassword !== undefined ? { passwordHash: await bcrypt.hash(newPassword, 12) } : {}),
      ...(endSessions ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: { id: true, isDisabled: true },
  });
  res.json(updated);
}));

// Delete an account for good. It is removed completely when nothing else depends on it; when orders, wallet records or a
// shop with products still hang on it, the account stays only as an anonymous, disabled row (the books need it).
adminRouter.delete("/users/:id", route(async (req, res) => {
  const target = await prisma.user.findUnique({ where: userId(req.params.id), select: { id: true, role: true } });
  if (!target) return sendError(res, 404, "NOT_FOUND", "User not found");
  if (target.role === "ADMIN") return sendError(res, 403, "FORBIDDEN", target.id === req.user!.id ? "An admin account cannot be deleted" : "An admin account can only be changed by its owner");
  res.json({ result: await eraseAccount(target.id) });
}));

/* ---------------- a shop's plan decides how many announcements it may send ---------------- */

adminRouter.put("/merchants/:id/plan", async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid().nullable() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const merchant = await prisma.merchantProfile.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!merchant) return sendError(res, 404, "NOT_FOUND", "Merchant not found");
  if (parsed.data.planId) {
    const plan = await prisma.servicePlan.findUnique({ where: { id: parsed.data.planId }, select: { service: true, isActive: true } });
    if (!plan || plan.service !== "MERCHANT_ACCOUNT") return sendError(res, 400, "BAD_REQUEST", "Choose one of the merchant plans");
  }
  const updated = await prisma.merchantProfile.update({ where: { id: merchant.id }, data: { planId: parsed.data.planId }, select: { id: true, planId: true } });
  res.json(updated);
});

/* ---------------- social channels (super admin can add new ones without code) ---------------- */

const channelSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,30}$/),
  name: z.string().min(1).max(60),
  driver: z.nativeEnum(ChannelDriver),
  isEnabled: z.boolean().default(true),
});

adminRouter.get("/channels", async (_req, res) => {
  res.json(await prisma.socialChannel.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { connections: true } } } }));
});

adminRouter.post("/channels", async (req, res) => {
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  try {
    res.status(201).json(await prisma.socialChannel.create({ data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return sendError(res, 409, "CONFLICT", "في قناة بنفس المفتاح");
    }
    throw err;
  }
});

adminRouter.patch("/channels/:id", async (req, res) => {
  const parsed = channelSchema.pick({ name: true, isEnabled: true }).partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const existing = await prisma.socialChannel.findUnique({ where: { id: req.params.id } });
  if (!existing) return sendError(res, 404, "NOT_FOUND", "Channel not found");
  res.json(await prisma.socialChannel.update({ where: { id: existing.id }, data: parsed.data }));
});

/* ---------------- top-up requests (local wallets are confirmed by hand) ---------------- */

adminRouter.get("/topups", async (req, res) => {
  const status = z.nativeEnum(TopUpStatus).optional().safeParse(req.query.status);
  res.json(
    await prisma.topUpRequest.findMany({
      where: status.success && status.data ? { status: status.data } : {},
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});

adminRouter.post("/topups/:id/approve", async (req, res) => {
  const parsed = z.object({ amountCredits: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.topUpRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return { code: 404 as const };
    if (request.status !== "PENDING") return { code: 409 as const };
    // Conditional update makes a double-click / two admins approving the same request credit only once.
    const claimed = await tx.topUpRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "APPROVED", verifiedBy: "ADMIN", amountCredits: parsed.data.amountCredits },
    });
    if (claimed.count === 0) return { code: 409 as const };
    await adjustBalance(tx, request.userId, parsed.data.amountCredits, "TOPUP", `${request.method}:${request.reference}`);
    return { code: 200 as const };
  });
  if (result.code === 404) return sendError(res, 404, "NOT_FOUND", "Request not found");
  if (result.code === 409) return sendError(res, 409, "CONFLICT", "الطلب انعالج من قبل");
  res.json({ id: req.params.id, status: "APPROVED" });
});

adminRouter.post("/topups/:id/reject", async (req, res) => {
  const parsed = z.object({ note: z.string().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const claimed = await prisma.topUpRequest.updateMany({
    where: { id: req.params.id, status: "PENDING" },
    data: { status: "REJECTED", verifiedBy: "ADMIN", note: parsed.data.note },
  });
  if (claimed.count === 0) return sendError(res, 409, "CONFLICT", "الطلب غير موجود أو انعالج من قبل");
  res.json({ id: req.params.id, status: "REJECTED" });
});

/* ---------------- manual wallet adjustment & subscriptions overview ---------------- */

adminRouter.post("/wallet/adjust", async (req, res) => {
  const parsed = z
    .object({ userEmail: z.string().email(), amount: z.number().int().refine((n) => n !== 0), note: z.string().max(200).optional() })
    .safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = await prisma.user.findUnique({ where: { email: parsed.data.userEmail } });
  if (!user) return sendError(res, 404, "NOT_FOUND", "No user with that email");
  try {
    const { balance, transactionId } = await prisma.$transaction((tx) =>
      adjustBalance(tx, user.id, parsed.data.amount, "ADJUSTMENT", parsed.data.note),
    );
    res.json({ userId: user.id, balance, transactionId });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return sendError(res, 409, "CONFLICT", "الرصيد ما بيكفي للخصم");
    throw err;
  }
});

adminRouter.get("/responder/subscriptions", async (_req, res) => {
  res.json(
    await prisma.responderSubscription.findMany({
      where: { status: { not: "OFF" } },
      include: { user: { select: { email: true, fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});

/* ---------------- AI provider check (booleans + counters only — no keys, no message text) ---------------- */

/* ---------------- push notifications: is Firebase set up, and does a message reach this admin's phone? ---------------- */

adminRouter.get("/push-status", async (_req, res) => {
  res.json(await pushStatus());
});

adminRouter.post("/push-test", async (req, res) => {
  const devices = await prisma.deviceToken.count({ where: { userId: req.user!.id } });
  if (!devices) {
    return sendError(res, 409, "NO_DEVICE", "ما في جهاز مسجّل لحسابك — سجّل دخولك بتطبيق أندرويد (النسخة الجديدة) بهالحساب أول.");
  }
  const errors: string[] = [];
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { language: true } });
  const lang = me?.language ?? DEFAULT_LANGUAGE;
  const title = translateText("إشعار تجريبي من دليلكم 🔔", lang);
  const body = translateText("إذا وصلك هذا الإشعار فالإشعارات شغّالة.", lang);
  const delivered = await sendPushToUser(req.user!.id, { title, body, data: { type: "TEST" } }, errors);
  res.json({ devices, delivered, errors });
});

/* ---------------- the product categories shops added themselves ---------------- */

adminRouter.get("/product-categories", route(async (_req, res) => {
  const rows = await prisma.productCategory.findMany({ where: { isCustom: true }, orderBy: { createdAt: "desc" }, take: 300, include: { _count: { select: { products: true } }, parent: { select: { name: true } } } });
  const shops = await prisma.merchantProfile.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, businessName: true } });
  res.json(rows.map((r) => ({ id: r.id, name: r.name, nameEn: r.nameEn, parentName: r.parent?.name ?? null, productCount: r._count.products, createdAt: r.createdAt, shop: shops.find((s) => s.id === r.createdById)?.businessName ?? null })));
}));

adminRouter.patch("/product-categories/:id", route(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(40).optional(), nameEn: z.string().trim().max(60).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const row = await prisma.productCategory.findUnique({ where: { id: req.params.id } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "Category not found");
  await prisma.productCategory.update({ where: { id: row.id }, data: { ...(parsed.data.name ? { name: parsed.data.name } : {}), ...(parsed.data.nameEn !== undefined ? { nameEn: parsed.data.nameEn || null } : {}) } });
  invalidateProductCategories();
  res.json({ ok: true });
}));

// Deleting one hands its products and its sub-categories to the category above it.
adminRouter.delete("/product-categories/:id", route(async (req, res) => {
  const row = await prisma.productCategory.findUnique({ where: { id: req.params.id } });
  if (!row) return sendError(res, 404, "NOT_FOUND", "Category not found");
  if (!row.isCustom) return sendError(res, 409, "CONFLICT", "Only a category a shop added can be deleted");
  await prisma.$transaction([
    prisma.product.updateMany({ where: { productCategoryId: row.id }, data: { productCategoryId: row.parentId } }),
    prisma.productCategory.updateMany({ where: { parentId: row.id }, data: { parentId: row.parentId } }),
    prisma.productCategory.delete({ where: { id: row.id } }),
  ]);
  invalidateProductCategories();
  res.json({ ok: true });
}));

/* ---------------- products waiting to be looked at ---------------- */

const PRODUCTS_PAGE = 50;
const adminProduct = (p: Prisma.ProductGetPayload<{ include: { merchant: { select: { businessName: true; phone: true } } } }>) => ({
  id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, stock: p.stock, isActive: p.isActive, condition: p.condition,
  specs: Array.isArray(p.specs) ? p.specs : [], images: p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
  moderation: p.moderation, note: p.moderationNote, createdAt: p.createdAt, updatedAt: p.updatedAt, shop: p.merchant.businessName, phone: p.merchant.phone,
});

// Every product, whatever its state: waiting, accepted or refused (or all), searchable, 50 to a page
adminRouter.get("/products", route(async (req, res) => {
  const parsed = z.object({
    status: z.enum(["PENDING", "REJECTED", "APPROVED", "ALL"]).catch("PENDING"),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(100000).catch(1),
  }).parse(req.query);
  const where: Prisma.ProductWhereInput = {
    ...(parsed.status === "ALL" ? {} : { moderation: parsed.status }),
    ...(parsed.q ? { OR: [{ name: { contains: parsed.q, mode: "insensitive" } }, { description: { contains: parsed.q, mode: "insensitive" } }, { merchant: { businessName: { contains: parsed.q, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: parsed.status === "PENDING" ? "asc" : "desc" }, { id: "asc" }],
      skip: (parsed.page - 1) * PRODUCTS_PAGE,
      take: PRODUCTS_PAGE,
      include: { merchant: { select: { businessName: true, phone: true } } },
    }),
  ]);
  res.set({ "X-Total-Count": String(total), "X-Page-Size": String(PRODUCTS_PAGE) });
  res.json(rows.map(adminProduct));
}));

// The admin fixes what a product says (a wrong word, a price, the stock) or hides it, without sending it back through the review
adminRouter.patch("/products/:id", route(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
    condition: z.enum(["NEW", "USED"]).nullable().optional(),
    specs: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(160) })).max(20).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const exists = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) return sendError(res, 404, "NOT_FOUND", "Product not found");
  const { specs, description, ...rest } = parsed.data;
  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { ...rest, ...(description !== undefined ? { description: description || null } : {}), ...(specs !== undefined ? { specs } : {}) },
    include: { merchant: { select: { businessName: true, phone: true } } },
  });
  res.json(adminProduct(updated));
}));

adminRouter.post("/products/:id/approve", route(async (req, res) => {
  if (!(await decideProduct(req.params.id, true, ""))) return sendError(res, 404, "NOT_FOUND", "Product not found");
  res.json({ ok: true });
}));

adminRouter.post("/products/:id/reject", route(async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().max(200).default("") }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!(await decideProduct(req.params.id, false, parsed.data.reason))) return sendError(res, 404, "NOT_FOUND", "Product not found");
  res.json({ ok: true });
}));

// Asks the image model to edit a tiny picture and says what happened: the answer when "photo editing does nothing".
adminRouter.post("/ai-image-test", route(async (_req, res) => {
  if (!imageEditAvailable()) return res.json({ ok: false, reason: "GEMINI_API_KEY is not set on the server" });
  const sample = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#d33" } }).png().toBuffer();
  const started = Date.now();
  const edited = await editPhotoWithAi({ mime: "image/png", data: sample }, "Change the colour of this picture to blue. Output only the edited image.");
  res.json({ ok: !!edited, ms: Date.now() - started, reason: edited ? null : lastImageEditError() });
}));

adminRouter.get("/ai-status", async (_req, res) => {
  res.json({
    ...aiProviderStatus(),
    vision: visionAvailable(), // can any configured provider look at a photo (search by photo, a product from a photo)?
    usage: aiUsage(), // this process, exact
    usageTotals: await aiTotals(), // durable, survives deploys; null if the database is unreachable
  });
});

// Asks one provider a tiny real question, so a newly added key is proven by an actual answer.
adminRouter.post("/ai-test", async (req, res) => {
  const provider = typeof req.body?.provider === "string" ? req.body.provider : "";
  const result = await testProvider(provider);
  if (!result) return sendError(res, 404, "NOT_FOUND", "Unknown provider");
  res.json(result);
});

// Sample shops and 50 sample products for the online store, to judge its look before real merchants fill it.
adminRouter.post("/demo-store", async (_req, res) => {
  res.json(await addDemoStore());
});

adminRouter.delete("/demo-store", async (_req, res) => {
  res.json(await removeDemoStore());
});

/* ---------------- advertising space bookings ---------------- */

adminRouter.get("/ads", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.adBooking.findMany({
    where: status && ["PENDING", "ACTIVE", "REJECTED", "CANCELLED"].includes(status) ? { status: status as "PENDING" | "ACTIVE" | "REJECTED" | "CANCELLED" } : {},
    include: { merchant: { select: { id: true, businessName: true } }, product: { select: { id: true, name: true, icon: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const withPicture = await creativeIds("SPACE", rows.map((a) => a.id));
  res.json(rows.map((a) => ({
    hasImage: withPicture.has(a.id),
    id: a.id,
    merchant: a.merchant,
    product: a.product,
    country: a.countryCode,
    slot: a.slot,
    days: a.days,
    credits: a.credits,
    status: a.status,
    state: adState(a),
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    impressions: a.impressions,
    clicks: a.clicks,
    rejectionReason: a.rejectionReason,
    createdAt: a.createdAt,
  })));
});

adminRouter.post("/ads/:id/approve", route(async (req, res) => {
  await approveAd(req.params.id);
  res.json({ ok: true });
}));

adminRouter.post("/ads/:id/reject", route(async (req, res) => {
  const reason = z.object({ reason: z.string().trim().max(300).optional() }).safeParse(req.body);
  await rejectAd(req.params.id, reason.success ? reason.data.reason : undefined);
  res.json({ ok: true });
}));

/* ---------------- discounts: every shop's discount waits here for approval ---------------- */

adminRouter.get("/discounts", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.discount.findMany({
    where: status && ["PENDING", "APPROVED", "REJECTED"].includes(status) ? { status: status as "PENDING" } : {},
    include: { merchant: { select: { id: true, businessName: true, phone: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const scopeOf = await discountScopeInfo(rows);
  res.json(rows.map((d) => ({
    id: d.id, merchant: d.merchant, title: d.title, percent: d.percent, description: d.description, startDate: d.startDate, endDate: d.endDate,
    maxCustomers: d.maxCustomers, perCustomerLimit: d.perCustomerLimit, status: d.status, state: discountState(d), rejectionReason: d.rejectionReason, ...scopeOf(d),
  })));
});

adminRouter.post("/discounts/:id/approve", async (req, res) => {
  const d = await prisma.discount.findUnique({ where: { id: req.params.id }, include: { merchant: { select: { userId: true } } } });
  if (!d) return sendError(res, 404, "NOT_FOUND", "الحسم غير موجود");
  await prisma.discount.update({ where: { id: d.id }, data: { status: "APPROVED", rejectionReason: null } });
  await notify({ userId: d.merchant.userId, type: "SYSTEM", title: "تمت الموافقة على حسمك", body: d.title, data: { kind: "DISCOUNT_APPROVED", discountId: d.id }, email: false });
  res.json({ ok: true });
});

adminRouter.post("/discounts/:id/reject", async (req, res) => {
  const reason = z.object({ reason: z.string().trim().max(300).optional() }).safeParse(req.body);
  const d = await prisma.discount.findUnique({ where: { id: req.params.id }, include: { merchant: { select: { userId: true } } } });
  if (!d) return sendError(res, 404, "NOT_FOUND", "الحسم غير موجود");
  const why = reason.success ? reason.data.reason : undefined;
  await prisma.discount.update({ where: { id: d.id }, data: { status: "REJECTED", rejectionReason: why ?? null } });
  await notify({ userId: d.merchant.userId, type: "SYSTEM", title: "لم تتم الموافقة على حسمك", body: why ? `${d.title} — السبب: ${why}` : d.title, data: { kind: "DISCOUNT_REJECTED", discountId: d.id }, email: false });
  res.json({ ok: true });
});

/* ---------------- big-banner bookings: the shops that asked for one, with the number to call ---------------- */

adminRouter.get("/banner-bookings", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.bannerBooking.findMany({
    where: status && ["PENDING", "CONTACTED", "SCHEDULED", "REJECTED", "CANCELLED"].includes(status) ? { status: status as "PENDING" } : {},
    include: { merchant: { select: { id: true, businessName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const withPicture = await creativeIds("BANNER", rows.map((b) => b.id));
  res.json(rows.map((b) => ({ ...b, hasImage: withPicture.has(b.id) })));
});

// the picture a shop sent with its booking, for the admin's eyes (kind: banner | space)
adminRouter.get("/ad-creatives/:kind/:bookingId", route(async (req, res) => {
  const kind = req.params.kind === "banner" ? "BANNER" : req.params.kind === "space" ? "SPACE" : null;
  const c = kind ? await getCreative(kind, req.params.bookingId) : null;
  if (!c) return sendError(res, 404, "NOT_FOUND", "ما في صورة");
  res.set({ "Content-Type": c.mime, "Cache-Control": "private, no-store" });
  res.end(Buffer.from(c.data));
}));

adminRouter.post("/banner-bookings/:id/contacted", route(async (req, res) => {
  await markBannerContacted(req.params.id);
  res.json({ ok: true });
}));

adminRouter.post("/banner-bookings/:id/reject", route(async (req, res) => {
  const reason = z.object({ reason: z.string().trim().max(300).optional() }).safeParse(req.body);
  await rejectBannerBooking(req.params.id, reason.success ? reason.data.reason : undefined);
  res.json({ ok: true });
}));

/* ---------------- the store's front-page banners ---------------- */

const bannerFields = z.object({
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).nullable().optional(),
  buttonText: z.string().trim().max(30).nullable().optional(),
  bg: z.enum(["coral", "black", "blue", "green", "purple", "gold"]).default("coral"),
  targetType: z.enum(["none", "product", "section", "shop", "deals", "url"]).default("none"),
  targetValue: z.string().trim().max(500).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  bookingId: z.string().uuid().nullable().optional(),
});

function bannerData(input: Partial<z.infer<typeof bannerFields>>) {
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle || null } : {}),
    ...(input.buttonText !== undefined ? { buttonText: input.buttonText || null } : {}),
    ...(input.bg !== undefined ? { bg: input.bg } : {}),
    ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
    ...(input.targetValue !== undefined ? { targetValue: input.targetValue || null } : {}),
    ...(input.countryCode !== undefined ? { countryCode: input.countryCode ? input.countryCode.toUpperCase() : null } : {}),
    ...(input.startsAt !== undefined ? { startsAt: date(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: date(input.endsAt) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.bookingId !== undefined ? { bookingId: input.bookingId } : {}),
  };
}

const bannerSelect = {
  id: true, sortOrder: true, isActive: true, title: true, subtitle: true, buttonText: true, bg: true, targetType: true, targetValue: true,
  countryCode: true, startsAt: true, endsAt: true, imageMime: true, imageUpdatedAt: true, views: true, clicks: true, bookingId: true, createdAt: true,
} as const;

adminRouter.get("/banners", async (_req, res) => {
  const rows = await prisma.storeBanner.findMany({ select: bannerSelect, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  res.json(rows.map((b) => ({ ...b, imageUrl: b.imageMime ? `/store/banners/${b.id}/image?v=${b.imageUpdatedAt?.getTime() ?? 0}` : null })));
});

adminRouter.post("/banners", async (req, res) => {
  const parsed = bannerFields.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const last = await prisma.storeBanner.aggregate({ _max: { sortOrder: true } });
  const banner = await prisma.storeBanner.create({
    data: { ...(bannerData(parsed.data) as { title: string }), sortOrder: (last._max.sortOrder ?? 0) + 1 },
    select: bannerSelect,
  });
  if (banner.bookingId) await linkBannerToBooking(banner.bookingId, banner.id);
  // the shop's own picture becomes the banner's picture (the admin can still upload another over it)
  if (banner.bookingId && (await copyCreativeToBanner(banner.bookingId, banner.id))) return res.status(201).json({ ...banner, imageUrl: `/store/banners/${banner.id}/image?v=${Date.now()}` });
  res.status(201).json(banner);
});

adminRouter.patch("/banners/:id", async (req, res) => {
  const parsed = bannerFields.partial().safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const exists = await prisma.storeBanner.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) return sendError(res, 404, "NOT_FOUND", "البانر غير موجود");
  const updated = await prisma.storeBanner.update({ where: { id: req.params.id }, data: bannerData(parsed.data), select: bannerSelect });
  if (updated.bookingId) await linkBannerToBooking(updated.bookingId, updated.id);
  res.json(updated);
});

adminRouter.delete("/banners/:id", async (req, res) => {
  await prisma.storeBanner.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// The picture comes as raw image bytes (like profile photos); a banner without one is drawn from its colour.
adminRouter.put(
  "/banners/:id/image",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: 2 * 1024 * 1024 }),
  async (req, res) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return sendError(res, 415, "UNSUPPORTED_MEDIA", "أرسل الصورة بصيغة JPEG أو PNG أو WebP");
    const mime = sniffImageMime(body);
    if (!mime) return sendError(res, 415, "UNSUPPORTED_MEDIA", "الملف ليس صورة صالحة (JPEG أو PNG أو WebP)");
    const exists = await prisma.storeBanner.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return sendError(res, 404, "NOT_FOUND", "البانر غير موجود");
    await prisma.storeBanner.update({ where: { id: req.params.id }, data: { imageMime: mime, imageData: body, imageUpdatedAt: new Date() } });
    res.json({ ok: true });
  },
);

adminRouter.delete("/banners/:id/image", async (req, res) => {
  await prisma.storeBanner.updateMany({ where: { id: req.params.id }, data: { imageMime: null, imageData: null, imageUpdatedAt: null } });
  res.json({ ok: true });
});

// The new order of all the banners (the ids, first to last).
adminRouter.put("/banners-order", async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).max(500) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await prisma.$transaction(parsed.data.ids.map((id, i) => prisma.storeBanner.updateMany({ where: { id }, data: { sortOrder: i + 1 } })));
  res.json({ ok: true });
});
