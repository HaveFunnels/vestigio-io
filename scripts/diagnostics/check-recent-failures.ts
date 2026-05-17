/* eslint-disable */
// Inspect recent cycles for a given org or environment — surfaces lastError,
// retry count, evidence breakdown, and projectionsCache state. Useful when
// debugging "the cycle keeps failing / never produces a cache" reports.
//
// Usage:
//   DATABASE_URL=... npx tsx scripts/diagnostics/check-recent-failures.ts \
//     --org <organizationId>          # any org cuid
//   DATABASE_URL=... npx tsx scripts/diagnostics/check-recent-failures.ts \
//     --env <environmentId>           # specific environment cuid
//   --limit <n>                       # how many cycles to show (default 6)
//
// You can also pass ORG_ID / ENV_ID via env vars.

import { PrismaClient } from "@prisma/client";

function arg(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	if (i === -1) return undefined;
	return process.argv[i + 1];
}

const orgId = arg("--org") ?? process.env.ORG_ID;
const envIdArg = arg("--env") ?? process.env.ENV_ID;
const limit = Number(arg("--limit") ?? "6");

if (!orgId && !envIdArg) {
	console.error("usage: check-recent-failures.ts (--org <id> | --env <id>) [--limit n]");
	process.exit(1);
}

const prisma = new PrismaClient({ log: [] });

(async () => {
	let environmentId = envIdArg;
	if (!environmentId && orgId) {
		const env = await prisma.environment.findFirst({
			where: { organizationId: orgId },
			select: { id: true, domain: true },
		});
		if (!env) {
			console.error(`No environment for org ${orgId}`);
			process.exit(1);
		}
		environmentId = env.id;
		console.log(`Resolved org ${orgId} → env ${env.id} (${env.domain})`);
	}

	const cycles = await prisma.auditCycle.findMany({
		where: { environmentId },
		orderBy: { createdAt: "desc" },
		take: limit,
		select: {
			id: true,
			status: true,
			cycleType: true,
			createdAt: true,
			completedAt: true,
			lastError: true,
			lastErrorAt: true,
			retryCount: true,
			projectionsCache: true,
		},
	});

	for (const c of cycles) {
		const dur = c.completedAt
			? `${Math.round((c.completedAt.getTime() - c.createdAt.getTime()) / 1000)}s`
			: c.status === "running"
				? `${Math.round((Date.now() - c.createdAt.getTime()) / 1000)}s (in-flight)`
				: "—";

		console.log(`\n${"━".repeat(72)}`);
		console.log(`${c.id}  ${c.status}/${c.cycleType}`);
		console.log(`  created  : ${c.createdAt.toISOString()}`);
		console.log(`  completed: ${c.completedAt?.toISOString() ?? "—"}`);
		console.log(`  duration : ${dur}`);
		console.log(`  cache    : ${c.projectionsCache ? "populated" : "NULL"}`);
		console.log(`  retries  : ${c.retryCount}`);
		if (c.lastError) {
			console.log(`  lastError@${c.lastErrorAt?.toISOString() ?? "?"}:`);
			console.log(`    ${c.lastError.slice(0, 800)}`);
		}

		const cycleRef = `audit_cycle:${c.id}`;
		const counts = await prisma.evidence.groupBy({
			by: ["evidenceType"],
			where: { environmentRef: environmentId, cycleRef },
			_count: { evidenceType: true },
		});
		if (counts.length === 0) {
			console.log("  evidence : (none yet)");
		} else {
			console.log("  evidence :");
			for (const ev of counts.sort((a, b) => b._count.evidenceType - a._count.evidenceType)) {
				console.log(`    ${ev._count.evidenceType.toString().padStart(4)} × ${ev.evidenceType}`);
			}
		}
	}

	await prisma.$disconnect();
})().catch((err) => {
	console.error(err);
	prisma.$disconnect();
	process.exit(1);
});
