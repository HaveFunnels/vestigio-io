/**
 * scripts/inspect-plan-configs.ts
 *
 * Reads the plan_configs row from PlatformConfig and reports which
 * plans have Paddle IDs provisioned. Used before flipping the payment
 * provider to Paddle to confirm plans/prices exist upstream.
 *
 *   DATABASE_URL="…" npx tsx scripts/inspect-plan-configs.ts
 */

import { PrismaClient } from "@prisma/client";

async function main() {
	const prisma = new PrismaClient();
	try {
		const row = await prisma.platformConfig.findUnique({
			where: { configKey: "plan_configs" },
		});
		if (!row) {
			console.log("[inspect] no plan_configs row — run /api/admin/pricing POST first");
			return;
		}
		const plans = JSON.parse(row.value) as Array<{
			key: string;
			label: string;
			monthlyPriceCents: number;
			monthlyPriceCentsBrl?: number;
			paddleProductId?: string;
			paddlePriceId?: string;
			paddleAnnualPriceId?: string;
			mpPreapprovalPlanId?: string;
			mpAnnualPreapprovalPlanId?: string;
		}>;

		console.log(`\n${plans.length} plans found:\n`);
		for (const p of plans) {
			const paddleReady =
				!!p.paddleProductId && !!p.paddlePriceId && !!p.paddleAnnualPriceId;
			const mpReady = !!p.mpPreapprovalPlanId && !!p.mpAnnualPreapprovalPlanId;
			console.log(`  ${p.key} — ${p.label}`);
			console.log(`    monthlyCents=${p.monthlyPriceCents} monthlyCentsBrl=${p.monthlyPriceCentsBrl ?? "(unset)"}`);
			console.log(`    paddle: product=${p.paddleProductId || "(missing)"} price=${p.paddlePriceId || "(missing)"} annual=${p.paddleAnnualPriceId || "(missing)"} ${paddleReady ? "✓" : "✗ NEEDS SYNC"}`);
			console.log(`    mp:     monthly=${p.mpPreapprovalPlanId || "(missing)"} annual=${p.mpAnnualPreapprovalPlanId || "(missing)"} ${mpReady ? "✓" : "✗"}`);
			console.log();
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error("[inspect] failed:", err);
	process.exit(1);
});
