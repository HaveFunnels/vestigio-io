import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { SUPPORTED_LOCALES } from "./supported-locales";

/**
 * Server-side resolver for "what locale should this request render in"
 * outside of the next-intl middleware path. Use in server components and
 * API routes that load locale-aware data (caption translations, dashboard
 * aggregator, cross-signal aggregator, MCP briefings, …).
 *
 * Priority chain mirrors src/i18n/request.ts:
 *   1. Authenticated user's DB locale (session.user.locale, kept fresh
 *      via the NextAuth JWT callback). Beats a stale cookie left over
 *      from a pre-locale-aware sign-up.
 *   2. Locale cookie — anonymous visitors and pre-login screens.
 *   3. Falls back to "en" so callers always get a useable string.
 *
 * Failing safely is more important than precision here — every caller
 * already degrades gracefully when the locale is "en".
 */
export async function resolveCurrentLocale(): Promise<string> {
	try {
		const session = await getServerSession(authOptions);
		const userLocale = (session?.user as { locale?: string } | undefined)?.locale;
		if (userLocale && SUPPORTED_LOCALES.includes(userLocale)) {
			return userLocale;
		}
	} catch {
		// Session decode failed — fall through to cookie/default.
	}
	try {
		const cookieStore = await cookies();
		const cookieLocale = cookieStore.get("locale")?.value;
		if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
			return cookieLocale;
		}
	} catch {
		// No cookie store (build-time evaluation, edge cases) — default.
	}
	return "en";
}
