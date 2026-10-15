/**
 * Print the measured funnel exactly as the plan would render it, for
 * one environment, against live data.
 *
 * Exists because the funnel's failure mode is not an error: a stage
 * whose instrument never fires inherits the sessions of the stages
 * above it and prints a clean 0% drop, which reads as "nobody
 * abandons here". The only way to catch that is to look at the stages
 * a real store produces.
 *
 * Usage: npx tsx scripts/diagnose-measured-funnel.ts <domain>
 */
import { PrismaClient } from "@prisma/client";
import { generateBehavioralMeasurement } from "../packages/strategy-plan/sections/behavioral-measurement";

async function main() {
	const domain = process.argv[2];
	if (!domain) throw new Error("usage: diagnose-measured-funnel.ts <domain>");
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

	const funnel = out?.funnel as
		| { stages: Record<string, unknown>[]; note?: string | null }
		| undefined;

	console.log(`env: ${env.domain}`);
	if (!funnel) {
		console.log(`no funnel. keys: ${Object.keys(out ?? {}).join(", ")}`);
	} else {
		console.log(`note: ${funnel.note ?? "(none)"}`);
		for (const s of funnel.stages) {
			const drop = s.dropPctFromPrev ?? "-";
			console.log(
				`  ${String(s.key).padEnd(10)} ${String(s.sessions).padStart(7)}  drop=${drop}`,
			);
		}
	}
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
