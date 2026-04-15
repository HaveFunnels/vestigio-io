import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Credit Packs — top-up bundles available to Max subscribers
//
// Single source of truth lives in PlatformConfig.credit_packs (seeded
// via scripts/populate-credit-packs.mjs when a new Paddle price lands).
//
// The webhook (src/app/api/paddle/webhook) consults this list to:
//   1. Match an incoming transaction's priceId to a known pack
//   2. Credit the right amount to OrgCredits.purchasedBalance
//
// The /app/billing UI (BuyCreditsModal) fetches the same list via
// /api/credit-packs so display stays in sync with what the webhook
// will actually process — no drift between "shown price" and "honored
// transaction."
// ──────────────────────────────────────────────

export interface CreditPack {
	key: string; // "pack-50" | "pack-200" | "pack-500"
	label: string; // UI label; i18n is keyed off `key`
	credits: number; // amount added to purchasedBalance on success
	priceId: string; // Paddle Price ID (pri_*)
	usdCents: number; // display-only
	brlCents: number; // display-only (real BRL is Paddle's custom price)
}

let cached: CreditPack[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute — matches plan-config.ts

export async function getCreditPacks(): Promise<CreditPack[]> {
	if (cached && Date.now() - cacheTime < CACHE_TTL) return cached;

	try {
		const row = await prisma.platformConfig.findUnique({
			where: { configKey: "credit_packs" },
		});
		if (row) {
			cached = JSON.parse(row.value);
			cacheTime = Date.now();
			return cached!;
		}
	} catch {
		// DB unavailable — fall through to empty. The UI gates the buy
		// button on `packs.length > 0` so this is safe.
	}
	return [];
}

/** Resolve a pack by its Paddle priceId (webhook uses this). */
export async function findPackByPriceId(
	priceId: string,
): Promise<CreditPack | null> {
	const packs = await getCreditPacks();
	return packs.find((p) => p.priceId === priceId) ?? null;
}

export function invalidateCreditPackCache(): void {
	cached = null;
	cacheTime = 0;
}
