/**
 * scripts/paddle-provision-annual.ts
 *
 * One-shot ops script. For every plan in PlatformConfig.plan_configs
 * that has `paddleProductId` set but no `paddleAnnualPriceId`, calls
 * Paddle POST /prices with billing_cycle=year and annualPriceCents
 * derived from ANNUAL_DISCOUNT_MULTIPLIER (currently 9.6 → 20% off).
 * Writes the returned Paddle price id back into plan_configs.
 *
 * Idempotent — plans that already have an annual price id are
 * skipped. Safe to re-run.
 *
 * Usage:
 *   DATABASE_URL="..." PADDLE_API_KEY="pdl_live_..." \
 *   npx tsx scripts/paddle-provision-annual.ts
 *
 * Add `--dry-run` to just print what would happen.
 */

import { PrismaClient } from "@prisma/client";

const ANNUAL_DISCOUNT_MULTIPLIER = 9.6;
const PADDLE_BASE_URL = process.env.NEXT_PUBLIC_PADDLE_API_URL || "https://api.paddle.com";
const CONFIG_KEY_PLANS = "plan_configs";

interface PlanRow {
	key: string;
	label: string;
	monthlyPriceCents: number;
	paddleProductId?: string;
	paddlePriceId?: string;
	paddleAnnualPriceId?: string;
	[k: string]: unknown;
}

function annualCentsFromMonthly(monthlyCents: number): number {
	return Math.round(monthlyCents * ANNUAL_DISCOUNT_MULTIPLIER);
}

async function createAnnualPrice(
	apiKey: string,
	productId: string,
	amountCents: number,
	label: string,
): Promise<{ id: string }> {
	const res = await fetch(`${PADDLE_BASE_URL}/prices`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			product_id: productId,
			description: `${label} — Annual`,
			unit_price: {
				amount: String(amountCents),
				currency_code: "USD",
			},
			billing_cycle: { interval: "year", frequency: 1 },
			tax_mode: "account_setting",
		}),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new Error(`Paddle POST /prices ${res.status}: ${text}`);
	}
	const parsed = JSON.parse(text) as { data?: { id?: string } };
	if (!parsed.data?.id) {
		throw new Error(`Paddle POST /prices returned no id: ${text}`);
	}
	return { id: parsed.data.id };
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const apiKey = process.env.PADDLE_API_KEY;
	if (!apiKey) {
		console.error("[paddle-provision-annual] PADDLE_API_KEY not set");
		process.exit(1);
	}

	const prisma = new PrismaClient();
	try {
		const row = await prisma.platformConfig.findUnique({
			where: { configKey: CONFIG_KEY_PLANS },
		});
		if (!row) {
			console.error("[paddle-provision-annual] no plan_configs row — nothing to do");
			process.exit(1);
		}

		const plans = JSON.parse(row.value) as PlanRow[];
		let touched = 0;
		const results: Array<{ key: string; status: string; priceId?: string; error?: string }> = [];

		for (const plan of plans) {
			if (plan.paddleAnnualPriceId) {
				results.push({ key: plan.key, status: "skipped (already set)", priceId: plan.paddleAnnualPriceId });
				continue;
			}
			if (!plan.paddleProductId) {
				results.push({ key: plan.key, status: "skipped (no paddleProductId)" });
				continue;
			}
			const annualCents = annualCentsFromMonthly(plan.monthlyPriceCents);
			if (dryRun) {
				results.push({ key: plan.key, status: `dry-run would create ${annualCents}c annual` });
				continue;
			}
			try {
				const price = await createAnnualPrice(
					apiKey,
					plan.paddleProductId,
					annualCents,
					plan.label,
				);
				plan.paddleAnnualPriceId = price.id;
				touched++;
				results.push({ key: plan.key, status: "created", priceId: price.id });
			} catch (err) {
				results.push({ key: plan.key, status: "failed", error: (err as Error).message });
			}
		}

		if (!dryRun && touched > 0) {
			await prisma.platformConfig.update({
				where: { configKey: CONFIG_KEY_PLANS },
				data: { value: JSON.stringify(plans) },
			});
		}

		console.log("\n[paddle-provision-annual] results:");
		for (const r of results) {
			console.log(`  ${r.key}: ${r.status}${r.priceId ? ` → ${r.priceId}` : ""}${r.error ? ` (${r.error})` : ""}`);
		}
		console.log(
			`\n[paddle-provision-annual] ${dryRun ? "dry-run" : `wrote back ${touched} plan(s)`}`,
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error("[paddle-provision-annual] failed:", err);
	process.exit(1);
});
