import { PrismaClient } from "@prisma/client";
import { rollUpTraffic } from "../packages/strategy-plan/sections/traffic-rollup";

// ──────────────────────────────────────────────
// One-time backfill of the traffic memory.
//
// The hourly pass only recomputes today and yesterday, which is right
// for steady state and useless on the first run: the table would start
// empty and the series would begin the day it shipped.
//
// We already hold 90 days of BehavioralSessionAggregate, so the memory
// can be born with a quarter of history instead of nothing. That is
// worth running once, immediately, because the floor the council
// complained about dissolves at roughly 90 days of accumulation and
// this buys that on day one rather than in February.
//
// Safe to re-run: every day is upserted on (envId, day, dimension,
// key), so a second pass costs duplicated work and never duplicated
// counts.
//
//   npx tsx scripts/backfill-traffic-rollup.ts [days]
// ──────────────────────────────────────────────

const prisma = new PrismaClient();

async function main() {
	const days = Number(process.argv[2]) || 90;
	const envs = await prisma.environment.findMany({
		where: { activated: true },
		select: { id: true, domain: true, organizationId: true },
	});

	console.log(`Preenchendo ${days} dias para ${envs.length} ambiente(s).\n`);
	let totalRows = 0;

	for (const env of envs) {
		const profile = await prisma.businessProfile
			.findUnique({
				where: { organizationId: env.organizationId },
				select: { conversionModel: true },
			})
			.catch(() => null);

		const started = Date.now();
		const r = await rollUpTraffic(
			prisma,
			env.id,
			days,
			new Date(),
			profile?.conversionModel ?? null,
		);
		totalRows += r.rowsWritten;
		const secs = ((Date.now() - started) / 1000).toFixed(1);
		console.log(
			`  ${env.domain.padEnd(28)} ${String(r.rowsWritten).padStart(6)} linhas  ` +
				`de ${r.sessionsScanned.toLocaleString("pt-BR")} sessões em ${secs}s`,
		);
	}

	// What the memory can already answer, as proof it is populated
	// rather than merely created.
	const span = await prisma.$queryRawUnsafe<{ first: Date; last: Date; n: bigint }[]>(
		`SELECT MIN("day") AS first, MAX("day") AS last, COUNT(*)::bigint AS n
		 FROM "TrafficDailyRollup"`,
	);
	const s = span[0];
	console.log(`\nTotal: ${totalRows.toLocaleString("pt-BR")} linhas.`);
	if (s?.n && Number(s.n) > 0) {
		console.log(
			`A série já cobre de ${s.first.toISOString().slice(0, 10)} a ` +
				`${s.last.toISOString().slice(0, 10)}.`,
		);
	}
	await prisma.$disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
