import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { authOptions } from "./auth";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the user's locale preference to the locale cookie.
 *
 * Priority chain:
 *   1. User.locale from JWT (explicitly saved in DB)
 *   2. Accept-Language header from browser (auto-detect)
 *   3. No-op (keep existing cookie or leave unset)
 *
 * This ensures that even users whose User.locale is null (e.g.,
 * promoted from lead without locale migration) get translations
 * based on their browser language on first visit.
 */
export async function syncUserLocale(): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return;

    const cookieStore = await cookies();
    const currentCookie = cookieStore.get("locale")?.value;

    // Priority 1: User's persisted locale from DB
    const userLocale = (session.user as any).locale;
    if (userLocale && SUPPORTED_LOCALES.includes(userLocale)) {
      if (currentCookie !== userLocale) {
        cookieStore.set("locale", userLocale, { maxAge: 60 * 60 * 24 * 30 });
      }
      return;
    }

    // Priority 2: If no persisted locale AND no cookie, detect from Accept-Language
    if (!currentCookie) {
      const headerStore = await headers();
      const acceptLang = headerStore.get("accept-language") || "";
      // Parse first language tag (e.g., "pt-BR,pt;q=0.9,en;q=0.8" → "pt-BR")
      const primary = acceptLang.split(",")[0]?.trim().split(";")[0]?.trim();
      if (primary) {
        const detected = SUPPORTED_LOCALES.find(
          l => l === primary || l.startsWith(primary.split("-")[0])
        );
        if (detected && detected !== "en") {
          cookieStore.set("locale", detected, { maxAge: 60 * 60 * 24 * 30 });
        }
      }
    }
  } catch {
    // Session not available (build phase, etc.) — skip silently
  }
}
