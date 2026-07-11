/**
 * scripts/update-plan-features.ts
 *
 * One-shot ops script. Overwrites the `features` array on each plan
 * in PlatformConfig.plan_configs with the current pt-BR editorial
 * feature list. Preserves everything else on each plan (prices,
 * Paddle/MP ids, limits, key/label).
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/update-plan-features.ts
 *   DATABASE_URL="..." npx tsx scripts/update-plan-features.ts --dry-run
 *
 * Idempotent — running twice writes the same content.
 */

import { PrismaClient } from "@prisma/client";

const CONFIG_KEY_PLANS = "plan_configs";

interface FeatureRow {
	name: string;
	included: boolean;
}

const FEATURES_BY_KEY: Record<string, FeatureRow[]> = {
	vestigio: [
		{ name: "1 domínio", included: true },
		{ name: "1 lugar na conta", included: true },
		{ name: "Análise contínua", included: true },
		{ name: "1 Plano de Estratégia por mês", included: true },
		{ name: "Exportação PDF + link de compartilhamento", included: true },
		{ name: "Framework Lens", included: true },
		{ name: "Buyer Trust Lens", included: false },
		{ name: "Lens comportamental", included: false },
		{ name: "R$/finding (ROI por achado)", included: false },
		{ name: "Benchmark vs Vestigio Index", included: false },
		{ name: "Conversar com o Plano", included: false },
		{ name: "Histórico e comparação entre meses", included: false },
		{ name: "Ativação com o time Vestigio", included: false },
		{ name: "Suporte por email", included: true },
	],
	pro: [
		{ name: "3 domínios", included: true },
		{ name: "3 lugares na conta", included: true },
		{ name: "Análise contínua", included: true },
		{ name: "1 Plano de Estratégia por mês", included: true },
		{ name: "Exportação PDF + link de compartilhamento", included: true },
		{ name: "Framework Lens", included: true },
		{ name: "Buyer Trust Lens", included: true },
		{ name: "Lens comportamental", included: false },
		{ name: "R$/finding (ROI por achado)", included: true },
		{ name: "Benchmark vs Vestigio Index", included: true },
		{ name: "Conversar com o Plano", included: true },
		{ name: "Histórico e comparação entre meses", included: false },
		{ name: "Ativação com o time Vestigio", included: false },
		{ name: "Suporte prioritário", included: true },
	],
	max: [
		{ name: "10 domínios", included: true },
		{ name: "10 lugares na conta", included: true },
		{ name: "Análise contínua", included: true },
		{ name: "1 Plano de Estratégia por mês", included: true },
		{ name: "Exportação PDF + link de compartilhamento", included: true },
		{ name: "Framework Lens", included: true },
		{ name: "Buyer Trust Lens", included: true },
		{ name: "Lens comportamental", included: true },
		{ name: "R$/finding (ROI por achado)", included: true },
		{ name: "Benchmark vs Vestigio Index", included: true },
		{ name: "Conversar com o Plano", included: true },
		{ name: "Histórico e comparação entre meses", included: true },
		{ name: "Ativação com o time Vestigio", included: true },
		{ name: "Suporte prioritário", included: true },
	],
};

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const prisma = new PrismaClient();
	try {
		const row = await prisma.platformConfig.findUnique({
			where: { configKey: CONFIG_KEY_PLANS },
		});
		if (!row) {
			console.error("[update-plan-features] no plan_configs row — save pricing first via /app/admin/pricing");
			process.exit(1);
		}
		const plans = JSON.parse(row.value) as Array<{ key: string; label: string; features?: FeatureRow[] }>;
		let touched = 0;
		for (const plan of plans) {
			const next = FEATURES_BY_KEY[plan.key];
			if (!next) {
				console.warn(`[update-plan-features] unknown plan key=${plan.key} — skipping`);
				continue;
			}
			const beforeCount = plan.features?.length ?? 0;
			plan.features = next;
			touched++;
			console.log(`  ${plan.key}: ${beforeCount} → ${next.length} features`);
		}
		if (dryRun) {
			console.log(`\n[update-plan-features] dry-run — would update ${touched} plan(s)`);
			return;
		}
		await prisma.platformConfig.update({
			where: { configKey: CONFIG_KEY_PLANS },
			data: { value: JSON.stringify(plans) },
		});
		console.log(`\n[update-plan-features] wrote back ${touched} plan(s)`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error("[update-plan-features] failed:", err);
	process.exit(1);
});
