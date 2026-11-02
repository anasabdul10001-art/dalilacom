/**
 * Facebook/Instagram linking is open to everyone only once Meta approves the app (App Review). Until then Meta delivers
 * nothing for pages of users who hold no role on the app, so a merchant would pay for a channel that stays silent.
 * Admins can still link (they hold a role on the Meta app), and META_PUBLIC_ACCESS=true opens it to all after approval.
 */
export const metaOpenFor = (role: string | undefined): boolean => process.env.META_PUBLIC_ACCESS === "true" || role === "ADMIN";

export const isMetaDriver = (driver: string): boolean => driver === "FACEBOOK" || driver === "INSTAGRAM";

export const META_NOT_OPEN_MESSAGE = "ربط فيسبوك وإنستغرام رح يتاح بعد ما توافق Meta على التطبيق — فيك تستعمل تيليغرام بالوقت الحالي";
