import { cookies } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";

/**
 * Sync the organization's locale to the locale cookie.
 *
 * Single source of truth: Organization.locale (set in org settings).
 * This ensures the ENTIRE platform — UI, findings, emails — is
 * coherent in one language per organization.
 *
 * Called on every /app layout render with the already-resolved org locale.
 * No-ops if cookie already matches.
 */
export async function syncUserLocale(orgLocale?: string): Promise<void> {
  try {
    if (!orgLocale || !SUPPORTED_LOCALES.includes(orgLocale)) return;

    const cookieStore = await cookies();
    const currentCookie = cookieStore.get("locale")?.value;

    if (currentCookie !== orgLocale) {
      cookieStore.set("locale", orgLocale, { maxAge: 60 * 60 * 24 * 30 });
    }
  } catch {
    // Session/DB not available — skip silently
  }
}
