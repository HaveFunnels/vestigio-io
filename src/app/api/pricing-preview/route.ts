import { NextRequest, NextResponse } from "next/server";
import { getPlanConfigs } from "@/libs/plan-config";
import { previewPrices, isPaddleConfigured } from "@/libs/paddle-api";

// ──────────────────────────────────────────────
// GET /api/pricing-preview
//
// Returns localized prices from Paddle's Pricing Preview API.
// The visitor's IP is forwarded to Paddle, which resolves it to
// a country and returns prices in the local currency (e.g., BRL
// for Brazil, EUR for Germany).
//
// Falls back to the standard USD plan configs when Paddle is not
// configured or the preview request fails.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: "$",
	BRL: "R$",
	EUR: "€",
	GBP: "£",
	MXN: "MX$",
	ARS: "ARS$",
	CLP: "CLP$",
};

export async function GET(req: NextRequest) {
	const plans = await getPlanConfigs();

	// Extract visitor IP for Paddle's geo-pricing
	const forwarded = req.headers.get("x-forwarded-for");
	const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || undefined;

	// Try Paddle preview with real localized prices
	if (isPaddleConfigured()) {
		const priceIds = plans
			.map((p) => p.paddlePriceId)
			.filter((id): id is string => !!id);

		if (priceIds.length > 0) {
			const preview = await previewPrices(
				priceIds.map((id) => ({ priceId: id, quantity: 1 })),
				ip,
			);

			if (preview) {
				const localizedPlans = plans.map((p) => {
					const item = preview.items.find((i) => i.priceId === p.paddlePriceId);
					return {
						key: p.key,
						label: p.label,
						monthlyPriceCents: item?.unitAmountCents ?? p.monthlyPriceCents,
						formattedPrice: item?.formattedTotal ?? null,
						paddlePriceId: p.paddlePriceId || "",
						maxMcpCalls: p.maxMcpCalls,
						continuousAudits: p.continuousAudits,
						creditsEnabled: p.creditsEnabled,
						maxEnvironments: p.maxEnvironments,
						maxMembers: p.maxMembers,
					};
				});

				return NextResponse.json(
					{
						plans: localizedPlans,
						currencyCode: preview.currencyCode,
						currencySymbol: CURRENCY_SYMBOLS[preview.currencyCode] || preview.currencyCode,
						localized: true,
					},
					{
						headers: {
							// Short cache — localized per IP, varies by visitor
							"Cache-Control": "private, max-age=300",
							Vary: "X-Forwarded-For",
						},
					},
				);
			}
		}
	}

	// Fallback: return USD prices from plan config
	const fallbackPlans = plans.map((p) => ({
		key: p.key,
		label: p.label,
		monthlyPriceCents: p.monthlyPriceCents,
		formattedPrice: null,
		paddlePriceId: p.paddlePriceId || "",
		maxMcpCalls: p.maxMcpCalls,
		continuousAudits: p.continuousAudits,
		creditsEnabled: p.creditsEnabled,
		maxEnvironments: p.maxEnvironments,
		maxMembers: p.maxMembers,
	}));

	return NextResponse.json(
		{
			plans: fallbackPlans,
			currencyCode: "USD",
			currencySymbol: "$",
			localized: false,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			},
		},
	);
}
