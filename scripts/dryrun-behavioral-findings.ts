/**
 * What the behavioural pipeline WOULD emit as findings, written
 * nowhere.
 *
 * Emission is flag-gated and off, because hero-metrics aggregates
 * Finding rows and turning it on would silently move the numbers in
 * the existing plan. This proves the eligibility rules against real
 * data without touching production.
 *
 * Usage: npx tsx scripts/dryrun-behavioral-findings.ts <domain>
 */
import { PrismaClient } from "@prisma/client";
import { generateMeasuredFriction } from "../packages/strategy-plan/sections/measured-friction";
import { buildBehavioralFindings } from "../packages/strategy-plan/sections/behavioral-findings";

async function main() {
	const domain = process.argv[2];
	if (!domain) throw new Error("usage: dryrun-behavioral-findings.ts <domain>");
	const prisma = new PrismaClient();

	const env = await prisma.environment.findFirst({
		where: { domain: { contains: domain } },
		select: { id: true, domain: true, organization: { select: { locale: true } } },
	});
	if (!env) throw new Error(`no environment matching "${domain}"`);

	const friction = await generateMeasuredFriction(prisma, {
		environmentId: env.id,
		envDomain: env.domain,
		locale: env.organization?.locale ?? "pt-BR",
	} as never);

	const { findings, rejections } = buildBehavioralFindings({
		friction,
		windowStart: friction?.windowStart ?? "",
		windowEnd: friction?.windowEnd ?? "",
	});

	console.log(`env: ${env.domain}`);
	console.log(`janela: ${friction?.windowStart} a ${friction?.windowEnd}`);
	console.log(`paginas medidas: ${friction?.pages.length ?? 0}\n`);

	console.log(`ELEGIVEIS: ${findings.length} findings`);
	for (const f of findings) {
		const ev = (f as unknown as { evidence: Record<string, unknown>[] }).evidence[0];
		const o = f as unknown as { origin: string; claim_type: string };
		console.log(
			`  ${f.inference_key.padEnd(30)} ${String(f.surface).padEnd(42)} ` +
				`sev=${String(f.severity).padEnd(6)} conf=${f.confidence} ` +
				`origin=${o.origin} claim=${o.claim_type} R$=${f.impact.midpoint}`,
		);
		console.log(
			`     evidencia: ${ev.count} ocorrencias | ${ev.sessions} sessoes | ` +
				`${ev.friction_rate_pct}% com atrito`,
		);
	}

	if (rejections.length) {
		console.log(`\nREJEITADOS: ${rejections.length}`);
		for (const r of rejections) console.log(`  ${r.path.padEnd(48)} ${r.reason}`);
	}

	console.log("\nnada foi gravado (dry run).");
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
