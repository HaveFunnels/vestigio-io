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

    // (1) For logged-in users the User.locale row is the source of truth —
    // overwrite the cookie when it drifts so client-side reads of the
    // cookie (e.g. analytics, the language selector UI) match the DB.
    // The selector writes BOTH DB and cookie on change, so this only kicks
    // in when an inherited bootstrap cookie disagrees with a more recent
    // DB update.
    if (userLocale && SUPPORTED_LOCALES.includes(userLocale)) {
      if (currentCookie !== userLocale) {
        cookieStore.set("locale", userLocale, { maxAge: 60 * 60 * 24 * 30 });
      }
      return;
    }

    // (2) Anonymous visitor or user without an explicit preference: a
    // valid cookie (set earlier by the language selector or geo bootstrap)
    // stays in place.
    if (currentCookie && SUPPORTED_LOCALES.includes(currentCookie)) {
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
