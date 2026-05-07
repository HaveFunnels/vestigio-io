import { cookies, headers } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the organization's locale to the locale cookie.
 *
 * Single source of truth: Organization.locale (set in org settings).
 * When org has no explicit locale set (null or 'en'), we DON'T touch
 * an existing cookie. If there's NO cookie at all, we detect from
 * the browser's Accept-Language header (one-time bootstrap).
 *
 * This ensures coherence: if org says pt-BR → everything pt-BR.
 * If org has no preference → respect whatever the user already had.
 */
export async function syncUserLocale(orgLocale?: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const currentCookie = cookieStore.get("locale")?.value;

    // Case 1: Org has explicit non-English locale → force it
    if (orgLocale && orgLocale !== 'en' && SUPPORTED_LOCALES.includes(orgLocale)) {
      if (currentCookie !== orgLocale) {
        cookieStore.set("locale", orgLocale, { maxAge: 60 * 60 * 24 * 30 });
      }
      return;
    }

    // Case 2: Org has no preference (null/'en') AND no cookie exists → bootstrap from browser
    if (!currentCookie) {
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
    }
    // Case 3: Cookie already exists → don't touch it (user or previous detection set it)
  } catch {
    // Session/DB not available — skip silently
  }
}
