import { cookies, headers } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the locale cookie from org and user preferences.
 *
 * Priority (highest first):
 *   1. Existing `locale` cookie — an explicit user choice, must always win.
 *      Includes the case where the user just clicked the language selector
 *      (which sets the cookie + updates User.locale + updates the JWT,
 *      then triggers router.refresh() which re-runs this function).
 *   2. User locale from JWT (User.locale) — restores the choice after a
 *      logout/login when the cookie was cleared.
 *   3. Org locale — only used as a bootstrap when the user has neither
 *      a cookie nor a personal preference yet (i.e. brand-new member of
 *      a pt-BR org should land in pt-BR by default).
 *   4. Browser Accept-Language header — for visitors with no signal at
 *      all (typically marketing/landing-page traffic before login).
 *
 * Earlier versions of this function force-overwrote the cookie with the
 * org locale on every page load, which silently undid any language
 * change the user made — that's the bug we're guarding against here.
 */
export async function syncUserLocale(orgLocale?: string, userLocale?: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const currentCookie = cookieStore.get("locale")?.value;

    // (1) Explicit user choice in the cookie wins — never clobber it.
    if (currentCookie && SUPPORTED_LOCALES.includes(currentCookie)) {
      return;
    }

    // (2) Restore the user's saved preference (e.g. after a fresh login
    // that cleared cookies).
    if (userLocale && SUPPORTED_LOCALES.includes(userLocale)) {
      cookieStore.set("locale", userLocale, { maxAge: 60 * 60 * 24 * 30 });
      return;
    }

    // (3) Bootstrap from the org's default locale for brand-new members.
    if (orgLocale && SUPPORTED_LOCALES.includes(orgLocale)) {
      cookieStore.set("locale", orgLocale, { maxAge: 60 * 60 * 24 * 30 });
      return;
    }

    // (4) Last-resort fallback to browser Accept-Language.
    const headerStore = await headers();
    const acceptLang = headerStore.get("accept-language") || "";
    const primary = acceptLang.split(",")[0]?.trim().split(";")[0]?.trim();
    if (primary) {
      const detected = SUPPORTED_LOCALES.find(
        l => l === primary || l.startsWith(primary.split("-")[0])
      );
      if (detected) {
        cookieStore.set("locale", detected, { maxAge: 60 * 60 * 24 * 30 });
      }
    }
  } catch {
    // Session/DB not available — skip silently
  }
}
