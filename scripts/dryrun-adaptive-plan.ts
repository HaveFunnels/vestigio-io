/**
 * What the four-part plan would say, rendered as text, written
 * nowhere.
 *
 * Usage: npx tsx scripts/dryrun-adaptive-plan.ts <domain>
 */
import { PrismaClient } from "@prisma/client";
import { buildAdaptivePlan, loadPlanFindings } from "../packages/strategy-plan/sections/adaptive-plan";
import { latestComprehensiveCycleId } from "../packages/strategy-plan/honest-aggregates";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

async function main() {
	const domain = process.argv[2];
	if (!domain) throw new Error("usage: dryrun-adaptive-plan.ts <domain>");
	const prisma = new PrismaClient();

	const env = await prisma.environment.findFirst({
		where: { domain: { contains: domain } },
		select: { id: true, domain: true, organization: { select: { locale: true } } },
	});
	if (!env) throw new Error(`no environment matching "${domain}"`);

	const cycleId = await latestComprehensiveCycleId(prisma, env.id, new Date());
	if (!cycleId) throw new Error("no comprehensive cycle with findings");

	const { findings, resolved } = await loadPlanFindings(prisma, env.id, cycleId);
	const plan = buildAdaptivePlan({
		findings,
		resolved,
		locale: env.organization?.locale ?? "pt-BR",
	});

	console.log(`${env.domain} — candidatos: ${findings.length}, resolvidos: ${resolved.length}\n`);
	console.log("── A. RESUMO ──────────────────────────────────");
	console.log(plan.executive.summary);
	console.log(
		`medidas=${plan.executive.measuredCount} indícios=${plan.executive.inferredCount} ` +
			`exposição estimada=${plan.executive.estimatedExposureBrl === null ? "(nenhuma modelada)" : brl(plan.executive.estimatedExposureBrl)}`,
	);

	console.log("\n── B. PRIORIDADES ─────────────────────────────");
	for (const p of plan.priorities) {
		const money = p.estimatedMonthlyLossBrl
			? `estimativa ${brl(p.estimatedMonthlyLossBrl.mid)}/mês (${brl(p.estimatedMonthlyLossBrl.min)}–${brl(p.estimatedMonthlyLossBrl.max)})`
			: "sem valor atribuído (medição, não estimativa)";
		console.log(`\n${p.rank}. [${p.claim}] ${p.headline}`);
		console.log(`   ${p.surface} · ${p.severity} · confiança ${p.confidence} (${p.confidenceTier}) · ${p.lifecycle}, ${p.cyclesSeen} ciclos`);
		console.log(`   ${money}`);
		if (p.measured?.length) {
			const m = p.measured[0] as Record<string, unknown>;
			console.log(`   medido: ${m.count} ocorrências em ${m.sessions} sessões (${m.friction_rate_pct}% com atrito)`);
		}
		if (p.why) console.log(`   por quê: ${String(p.why).slice(0, 150)}`);
	}

	console.log("\n── C. AÇÕES ───────────────────────────────────");
	for (const a of plan.actions) {
		console.log(`${a.rank}. ${String(a.what).slice(0, 110)}`);
		console.log(`   verificar: ${a.howToVerify}`);
	}

	console.log("\n── D. EVOLUÇÃO ────────────────────────────────");
	console.log(
		`novos=${plan.evolution.newCount} persistentes=${plan.evolution.persistentCount} ` +
			`resolvidos=${plan.evolution.resolvedCount} inconclusivos=${plan.evolution.inconclusiveCount}`,
	);

	console.log("\n(nada foi gravado)");
	await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
