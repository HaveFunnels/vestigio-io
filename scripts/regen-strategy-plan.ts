/**
 * scripts/regen-strategy-plan.ts
 *
 * One-shot ops script — regenerates the Monthly Strategy Plan for a
 * given environment + month. Reads env from DATABASE_URL. Runs the
 * same generateAndPersistPlan pipeline the cron uses.
 *
 *   DATABASE_URL="..." npx tsx scripts/regen-strategy-plan.ts <envId> [YYYY-MM]
 *
 * If month omitted, uses the current UTC month.
 */

import { PrismaClient } from "@prisma/client";
import { generateAndPersistPlan } from "../packages/strategy-plan";

async function main() {
	const envId = process.argv[2];
	if (!envId) {
		console.error("[regen] Usage: tsx scripts/regen-strategy-plan.ts <envId> [YYYY-MM]");
		process.exit(1);
	}
	const monthArg = process.argv[3];
	const month =
		monthArg ??
		`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		console.error(`[regen] month must be YYYY-MM, got ${month}`);
		process.exit(1);
	}

	const prisma = new PrismaClient();
	const t0 = Date.now();
	try {
		const env = await prisma.environment.findUnique({
			where: { id: envId },
			select: { id: true, domain: true },
		});
		if (!env) {
			console.error(`[regen] env ${envId} not found`);
			process.exit(1);
		}
		console.log(`[regen] env=${env.domain} month=${month} — starting`);
		const result = await generateAndPersistPlan(prisma, {
			environmentId: envId,
			month,
			locale: "pt-BR",
		});
		const durationMs = Date.now() - t0;
		console.log(
			`[regen] done. planId=${result.planId} llmCalls=${result.output.cost.llmCallsCount} cost=$${(result.output.cost.llmCostCents / 100).toFixed(4)} duration=${durationMs}ms`,
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error("[regen] failed:", err);
	process.exit(1);
});
