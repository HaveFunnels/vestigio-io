// ──────────────────────────────────────────────
// Payment Provider Resolver
//
// Single point that decides which gateway owns a given user/checkout.
// Default is `paddle` (multi-market, card-first). Admin can override
// via PlatformConfig.payment_provider (see /app/admin/pricing) —
// useful for A/B'ing MP against Paddle on the BR funnel without
// flipping env vars.
//
// History: through 2026-06 the default was mercadopago (BRL-only push
// after MP wedge testing). 2026-07 flip back to Paddle because MP
// sandbox never got preapproval+card_token working reliably and the
// prod card flow shipped fragile signals for the initial billing
// telemetry. Existing MP subscribers stay on MP via resolveUserProvider.
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
//      management UI; existing MP subscribers see MP UI. No forced
//      migration.
//
// The two can disagree (e.g. an existing MP user whose next checkout
// would be Paddle), which is exactly why they're separate functions
// and why we never let UI code conflate the two.
// ──────────────────────────────────────────────

import { isPaddleConfigured } from "@/libs/paddle-api";
import { isMpConfigured } from "@/libs/mp-api";
import { prisma } from "@/libs/prismaDb";

export type PaymentProvider = "mercadopago" | "paddle";

export const PROVIDER_CONFIG_KEY = "payment_provider";

/**
 * Provider for a brand-new checkout. Resolution order:
 *   1. PlatformConfig.payment_provider (admin override, if set)
 *   2. Default → "paddle" if PADDLE_API_KEY is configured
 *   3. Fallback → "mercadopago" (BR-only test environments)
 *
 * Async because step 1 hits the DB. Cache-safe to call per-request;
 * the single PlatformConfig row read is cheap and the value rarely
 * changes outside admin action.
 */
export async function getActiveProvider(): Promise<PaymentProvider> {
	const override = await prisma.platformConfig
		.findUnique({ where: { configKey: PROVIDER_CONFIG_KEY } })
		.catch(() => null);
	if (override?.value === "mercadopago" || override?.value === "paddle") {
		return override.value;
	}
	if (isPaddleConfigured()) return "paddle";
	if (isMpConfigured()) return "mercadopago";
	return "paddle";
}

/**
 * Synchronous default for code paths that can't await (e.g. SDK init
 * helpers). Uses env-based detection only — no DB read. Callers that
 * need the admin override must use `getActiveProvider()`.
 */
export function getDefaultProvider(): PaymentProvider {
	if (isPaddleConfigured()) return "paddle";
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
