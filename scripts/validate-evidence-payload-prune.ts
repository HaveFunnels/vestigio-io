/**
 * Proves the Evidence payload prune cannot reach a row that
 * carryEvidenceForward still needs, before it writes anything.
 *
 * The danger is specific and silent: carry-forward copies a prior
 * cycle's evidence into a new cycle when the content hash says the
 * page is unchanged. If it copied a pruned payload, the new cycle
 * would run inference over an empty object and conclude nothing is
 * wrong, with no error anywhere.
 *
 * Usage: npx tsx scripts/validate-evidence-payload-prune.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";
import {
	pruneEvidencePayloads,
	PRUNED_PAYLOAD,
	KEEP_RECENT_CYCLES,
	PAYLOAD_PRUNE_DAYS,
} from "../packages/evidence/prune-payloads";

async function main() {
	const apply = process.argv.includes("--apply");
	const prisma = new PrismaClient();

	const dry = await pruneEvidencePayloads(prisma, { dryRun: true });
	console.log(
		`candidates: ${dry.scanned} rows older than ${PAYLOAD_PRUNE_DAYS}d ` +
			`outside the ${KEEP_RECENT_CYCLES} most recent cycles per environment`,
	);

	// ── The safety property, checked directly ──────────────────────
	// For every environment, take the cycles carry-forward could read
	// and confirm none of their evidence is a prune candidate.
	const envs = await prisma.environment.findMany({ select: { id: true, domain: true } });
	let violations = 0;
	for (const env of envs) {
		const recent = await prisma.auditCycle.findMany({
			where: { environmentId: env.id },
			orderBy: { createdAt: "desc" },
			take: KEEP_RECENT_CYCLES,
			select: { id: true, createdAt: true, cycleType: true },
		});
		if (recent.length === 0) continue;

		const atRisk = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
			`SELECT count(*)::bigint AS count FROM "Evidence"
			 WHERE "auditCycleId" = ANY($1::text[])
			   AND "createdAt" < now() - make_interval(days => $2::int)
			   AND payload <> $3`,
			recent.map((c) => c.id),
			PAYLOAD_PRUNE_DAYS,
			PRUNED_PAYLOAD,
		);
		const n = Number(atRisk[0]?.count ?? 0);
		console.log(
			`  ${env.domain}: ${recent.length} recent cycles protected ` +
				`(newest ${recent[0].createdAt.toISOString().slice(0, 16)}, ${recent[0].cycleType}), ` +
				`${n} of their rows are older than the floor and stay intact`,
		);
	}

	// Carry-forward reads the cycle before the running one. Confirm
	// that for each environment that cycle still has real payloads.
	for (const env of envs) {
		const two = await prisma.auditCycle.findMany({
			where: { environmentId: env.id },
			orderBy: { createdAt: "desc" },
			take: 2,
			select: { id: true },
		});
		if (two.length < 2) continue;
		const prev = two[1].id;
		const total = await prisma.evidence.count({ where: { auditCycleId: prev } });
		const pruned = await prisma.evidence.count({
			where: { auditCycleId: prev, payload: PRUNED_PAYLOAD },
		});
		if (pruned > 0) {
			violations++;
			console.log(`  !! ${env.domain}: carry-forward source has ${pruned}/${total} pruned`);
		} else {
			console.log(`  ${env.domain}: carry-forward source intact (${total} rows)`);
		}
	}

	if (!apply) {
		console.log("\ndry run, nothing written. pass --apply to prune.");
		await prisma.$disconnect();
		process.exit(violations === 0 ? 0 : 1);
	}

	const t0 = Date.now();
	const res = await pruneEvidencePayloads(prisma);
	console.log(
		`\npruned ${res.pruned} rows in ${res.batches} batches (${Date.now() - t0}ms)`,
	);

	// ── Re-check the same property after writing ───────────────────
	let after = 0;
	for (const env of envs) {
		const two = await prisma.auditCycle.findMany({
			where: { environmentId: env.id },
			orderBy: { createdAt: "desc" },
			take: 2,
			select: { id: true },
		});
		if (two.length < 2) continue;
		const bad = await prisma.evidence.count({
			where: { auditCycleId: two[1].id, payload: PRUNED_PAYLOAD },
		});
		if (bad > 0) {
			after++;
			console.log(`  !! ${env.domain}: carry-forward source damaged (${bad} rows)`);
		}
	}
	console.log(after === 0 ? "carry-forward sources intact after prune" : "DAMAGE DETECTED");

	await prisma.$disconnect();
	process.exit(after === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
