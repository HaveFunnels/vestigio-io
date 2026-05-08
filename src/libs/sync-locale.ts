import { cookies, headers } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the locale cookie from org and user preferences.
 *
 * Priority: org locale > user locale (from DB/JWT) > existing cookie > browser detection.
 * This ensures the locale survives logout/login: even if the cookie was cleared,
 * the user's DB preference (carried in the JWT) restores it.
 */
export async function syncUserLocale(orgLocale?: string, userLocale?: string): Promise<void> {
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

    // Case 2: No cookie → restore from user's DB preference (survives logout)
    if (!currentCookie && userLocale && userLocale !== 'en' && SUPPORTED_LOCALES.includes(userLocale)) {
      cookieStore.set("locale", userLocale, { maxAge: 60 * 60 * 24 * 30 });
      return;
    }

    // Case 3: No cookie, no user preference → bootstrap from browser Accept-Language
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
    // Case 4: Cookie already exists → don't touch it
  } catch {
    // Session/DB not available — skip silently
  }
}
