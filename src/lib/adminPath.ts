/**
 * Where the admin panel page lives. "/admin" is the first place anyone tries, so the page is not there: it is at a path
 * that is not guessed from the domain. ADMIN_PAGE_PATH on the server overrides the built-in one (a slash and 6 or more
 * letters, digits, dots, dashes or underscores). The /admin/... API paths are unchanged: they all need an admin sign-in.
 */
const BUILT_IN = "/dk-panel-m7x3q9vz4p";

export function adminPagePath(): string {
  const wanted = (process.env.ADMIN_PAGE_PATH || "").trim();
  if (/^\/[A-Za-z0-9._-]{6,}$/.test(wanted) && !/^\/(admin|app|auth|health)$/i.test(wanted)) return wanted;
  return BUILT_IN;
}
