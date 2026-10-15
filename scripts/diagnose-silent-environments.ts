/**
 * Which environments have stopped being analysed.
 *
 * The heal cron watches cycles that hang. Nothing watched for cycles
 * that never start, which is how a paying customer went four days
 * with no analysis in October 2026 and nobody knew.
 *
 * Usage: npx tsx scripts/diagnose-silent-environments.ts
 */
import { PrismaClient } from "@prisma/client";
import { findSilentEnvironments, SILENCE_COLD_INTERVALS } from "../src/libs/silent-environment";

async function main() {
	const prisma = new PrismaClient();
	const findings = await findSilentEnvironments(prisma);

	console.log(
		`bar: ${SILENCE_COLD_INTERVALS}x the plan's cold-cycle interval of total silence\n`,
	);
	if (findings.length === 0) {
		console.log("no silent environments.");
	} else {
		for (const f of findings) {
			console.log(`[${f.kind}] ${f.domain ?? f.envId}`);
			console.log(`  ${f.detail}`);
			console.log(
				`  last cycle: ${f.hoursSinceLastCycle === null ? "never" : `${f.hoursSinceLastCycle}h ago`}` +
					`  ·  bar: ${f.thresholdHours}h`,
			);
		}
	}
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
