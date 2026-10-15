/**
 * Per-source measured behavior, as the plan's alert sees it.
 *
 * The alert that becomes a step fires per source on fixed thresholds
 * (median < 10s AND >80% no-scroll) and ignores volume entirely, so a
 * small bad source can be the only traffic the plan talks about while
 * a far larger merely-mediocre one is silent. This prints both the
 * thresholds and the sessions behind them.
 *
 * Usage: npx tsx scripts/diagnose-traffic-sources.ts <domain>
 */
import { PrismaClient } from "@prisma/client";
import { generateBehavioralMeasurement } from "../packages/strategy-plan/sections/behavioral-measurement";

async function main() {
	const domain = process.argv[2];
	if (!domain) throw new Error("usage: diagnose-traffic-sources.ts <domain>");
	const prisma = new PrismaClient();
	const env = await prisma.environment.findFirst({
		where: { domain: { contains: domain } },
		select: { id: true, domain: true, organization: { select: { locale: true } } },
	});
	if (!env) throw new Error(`no environment matching "${domain}"`);

	const out = (await generateBehavioralMeasurement(prisma, {
		environmentId: env.id,
		envDomain: env.domain,
		locale: env.organization?.locale ?? "pt-BR",
	} as never)) as Record<string, unknown> | null;

	const sources = (out?.sources ?? []) as {
		source: string;
		sessions: number;
		sharePct: number;
		medianDurationS: number;
		pctNoScroll: number;
	}[];
	const alerts = (out?.alerts ?? []) as { source: string }[];
	const alerted = new Set(alerts.map((a) => a.source));

	console.log(`env: ${env.domain}\n`);
	console.log(
		"source".padEnd(22) +
			"sessions".padStart(10) +
			"share".padStart(8) +
			"median".padStart(9) +
			"noScroll".padStart(10) +
			"  lost(sessions x noScroll)  alert",
	);
	for (const s of sources) {
		const lost = Math.round((s.sessions * s.pctNoScroll) / 100);
		console.log(
			s.source.slice(0, 21).padEnd(22) +
				String(s.sessions).padStart(10) +
				`${s.sharePct}%`.padStart(8) +
				`${s.medianDurationS}s`.padStart(9) +
				`${s.pctNoScroll}%`.padStart(10) +
				String(lost).padStart(22) +
				(alerted.has(s.source) ? "   <-- STEP" : ""),
		);
	}
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
