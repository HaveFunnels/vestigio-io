// ──────────────────────────────────────────────
// Payment Provider Resolver
//
// Single point that decides which gateway owns a given user/checkout.
// Hardcoded to `mercadopago` for now (BRL-only, single market). When
// we internationalize we'll extend `getActiveProvider` to inspect
// locale / feature flags before falling through to MP.
//
// Two distinct concerns this helper separates:
//
//   1. "Which provider should serve THIS user's NEXT checkout?" →
//      getActiveProvider() — used by the billing page + onboarding to
//      decide what UI/SDK to render.
//
//   2. "Which provider OWNS this user's CURRENT subscription?" →
//      resolveUserProvider() — derived from User.paymentProvider, set
//      only by webhooks. Existing Paddle subscribers see Paddle
//      management UI; new MP users see MP UI. No forced migration.
//
// The two can disagree (e.g. an existing Paddle user whose next
// checkout would be MP), which is exactly why they're separate
// functions and why we never let UI code conflate the two.
// ──────────────────────────────────────────────

import { isMpConfigured } from "@/libs/mp-api";

export type PaymentProvider = "mercadopago" | "paddle";

/**
 * Provider for a brand-new checkout. Until internationalization lands,
 * always returns `mercadopago` when MP is configured, else falls back
 * to `paddle` (so dev environments without MP creds still work).
 */
export function getActiveProvider(): PaymentProvider {
	if (isMpConfigured()) return "mercadopago";
	return "paddle";
}

/**
 * Provider that owns an existing user's subscription. Reads the
 * webhook-written `paymentProvider` field on User. Pre-MP users
 * (paymentProvider = null) are assumed Paddle since that was the only
 * gateway before. Type the input loosely so callers don't have to
 * import the Prisma User type for a one-field read.
 */
export function resolveUserProvider(user: {
	paymentProvider: string | null;
	subscriptionId?: string | null;
}): PaymentProvider | null {
	if (user.paymentProvider === "mercadopago") return "mercadopago";
	if (user.paymentProvider === "paddle") return "paddle";
	// Legacy fallback: pre-migration rows have no provider tag but may
	// still hold a Paddle subscription. Treat as paddle so cancel /
	// change-plan UI routes correctly.
	if (user.subscriptionId) return "paddle";
	return null;
}
