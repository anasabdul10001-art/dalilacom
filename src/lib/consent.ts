/** Version of the terms + privacy texts people accept (section 65). Bump it when the texts change materially. */
export const TERMS_VERSION = "2026-10";

/**
 * GDPR enforcement switch. Off: consent is recorded when a client sends it but nothing is refused, so apps that predate the
 * consent screens keep working. On (GDPR_STRICT=on): sign-up without accepting the terms, and location sharing without the
 * person's explicit consent, are refused.
 */
export const gdprStrict = () => process.env.GDPR_STRICT === "on";
