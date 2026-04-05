import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "./auth";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the user's persisted locale from DB → cookie.
 *
 * On login or first visit, the cookie may not reflect the user's
 * saved preference. This function reads the locale from the JWT
 * (populated from User.locale during auth) and sets the cookie
 * so the i18n middleware uses the correct language.
 *
 * No-ops if the cookie already matches.
 */
export async function syncUserLocale(): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return;

    const userLocale = (session.user as any).locale;
    if (!userLocale || !SUPPORTED_LOCALES.includes(userLocale)) return;

    const cookieStore = await cookies();
    const currentCookie = cookieStore.get("locale")?.value;

    // Only set if different — avoids unnecessary Set-Cookie headers
    if (currentCookie !== userLocale) {
      cookieStore.set("locale", userLocale, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
  } catch {
    // Session not available (build phase, etc.) — skip silently
  }
}
