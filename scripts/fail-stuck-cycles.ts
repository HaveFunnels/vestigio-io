import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STUCK_AGE_MIN = 30; // any cycle running > 30 min is stuck

async function main() {
	const dryRun = process.argv[2] !== "--apply";

	const cutoff = new Date(Date.now() - STUCK_AGE_MIN * 60 * 1000);
	const stuck = await prisma.auditCycle.findMany({
		where: { status: "running", createdAt: { lt: cutoff } },
		select: {
			id: true,
			environmentId: true,
			createdAt: true,
			currentPhase: true,
			environment: { select: { domain: true } },
		},
	});

	if (stuck.length === 0) {
		console.log(`No cycles running > ${STUCK_AGE_MIN}min.`);
		return;
	}

	const now = Date.now();
	for (const c of stuck) {
		const ageMin = Math.round((now - c.createdAt.getTime()) / 60000);
		console.log(
			`${dryRun ? "[DRY]" : "[APPLY]"} ${c.id.slice(-8)} ` +
				`env=${c.environment?.domain ?? c.environmentId.slice(-8)} ` +
				`phase=${c.currentPhase ?? "—"} age=${ageMin}min → failed`,
		);
		if (!dryRun) {
			await prisma.auditCycle.update({
				where: { id: c.id },
				data: {
					status: "failed",
					completedAt: new Date(),
					lastError: `manual recovery: stuck ${ageMin}min on ${c.currentPhase ?? "—"} (heartbeat alive but no phase progress)`,
					lastErrorAt: new Date(),
				},
			});
		}
	}

	console.log(`\n${dryRun ? "DRY RUN" : "APPLIED"} on ${stuck.length} cycles. Run with --apply to mutate.`);
}

main()
	.catch((e) => { console.error(e); process.exit(1); })
	.finally(() => prisma.$disconnect());
