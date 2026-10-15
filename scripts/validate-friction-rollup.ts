/**
 * Proves the friction rollup reproduces the live computation before
 * any reader is switched over to it.
 *
 * Two separate questions, deliberately not conflated:
 *
 *   A. ARITHMETIC. Does SUM(rollup) over the window equal a live scan
 *      of the SAME session set? This must match exactly. A mismatch
 *      means the daily bucketing or the shared scan is wrong, and
 *      nothing should be migrated.
 *
 *   B. BEHAVIOR. How far does the census (rollup, all sessions) sit
 *      from what production reports today (sample, most recent 4,000)?
 *      This is expected to differ. It is reported, not asserted, so
 *      the size of the change is known before it ships.
 *
 * Usage: npx tsx scripts/validate-friction-rollup.ts <envId|domain>
 */
import { PrismaClient } from "@prisma/client";
import {
	computeMeasuredFriction,
	MIN_EVENTS_INTERACTIVE,
	type TimelineRowInput,
} from "../packages/strategy-plan/sections/measured-friction";
import { rollUpFriction } from "../packages/strategy-plan/sections/friction-rollup";

const SAMPLE_CAP = 4000; // mirrors the live loader
const WINDOW_DAYS = 30;

async function main() {
	const arg = process.argv[2];
	if (!arg) throw new Error("usage: validate-friction-rollup.ts <envId|domain>");
	const prisma = new PrismaClient();

	const env = await prisma.environment.findFirst({
		where: { OR: [{ id: arg }, { domain: { contains: arg } }] },
		select: { id: true, domain: true },
	});
	if (!env) throw new Error(`no environment matching "${arg}"`);
	console.log(`env: ${env.domain} (${env.id})`);

	// The windows must be day-aligned to be comparable at all. The
	// rollup buckets by UTC calendar day, so a live scan over a
	// rolling "now minus 30 days" window silently includes a partial
	// day the rollup never covered, and every page then looks short by
	// a couple of percent for a reason that has nothing to do with the
	// arithmetic being tested.
	const now = new Date();
	const windowEnd = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 86400_000,
	);
	const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86400_000);

	// ── Build the rollup for the window ────────────────────────────
	console.log(`\nrolling up ${WINDOW_DAYS} days...`);
	const t0 = Date.now();
	const r = await rollUpFriction(prisma, env.id, WINDOW_DAYS, now);
	const rollupMs = Date.now() - t0;
	console.log(
		`  ${r.daysProcessed} days, ${r.sessionsScanned} sessions, ${r.rowsWritten} rows (${rollupMs}ms)`,
	);

	// ── A. ARITHMETIC: rollup SUM vs live scan of the same set ─────
	const summed = await prisma.frictionDailyRollup.groupBy({
		by: ["path"],
		where: { envId: env.id, day: { gte: windowStart, lt: windowEnd } },
		_sum: {
			sessions: true,
			sessionsWithFriction: true,
			deadClicks: true,
			hesitationsNearCta: true,
			inputAbandons: true,
			backtracks: true,
			formRetries: true,
		},
	});

	const t1 = Date.now();
	const allRows = (await prisma.behavioralSessionAggregate.findMany({
		where: {
			envId: env.id,
			startedAt: { gte: windowStart, lt: windowEnd },
			eventCount: { gte: MIN_EVENTS_INTERACTIVE },
		},
		select: { timeline: true, urls: true },
	})) as TimelineRowInput[];
	const censusMs = Date.now() - t1;
	const census = computeMeasuredFriction(allRows, windowStart, windowEnd);
	console.log(
		`\nlive census scan: ${allRows.length} sessions (${censusMs}ms to fetch)`,
	);

	const byPath = new Map(summed.map((s) => [s.path, s._sum]));
	let mismatches = 0;
	let checked = 0;
	for (const pg of census?.pages ?? []) {
		const got = byPath.get(pg.path);
		checked++;
		const fields: [string, number, number | null | undefined][] = [
			["sessions", pg.sessions, got?.sessions],
			["sessionsWithFriction", pg.sessionsWithFriction, got?.sessionsWithFriction],
			["deadClicks", pg.deadClicks, got?.deadClicks],
			["hesitationsNearCta", pg.hesitationsNearCta, got?.hesitationsNearCta],
			["inputAbandons", pg.inputAbandons, got?.inputAbandons],
			["backtracks", pg.backtracks, got?.backtracks],
			["formRetries", pg.formRetries, got?.formRetries],
		];
		const bad = fields.filter(([, live, roll]) => live !== (roll ?? 0));
		if (bad.length) {
			mismatches++;
			console.log(`\n  MISMATCH ${pg.path}`);
			for (const [f, live, roll] of bad) {
				console.log(`    ${f}: live=${live} rollup=${roll ?? 0}`);
			}
		}
	}
	console.log(
		`\nA. ARITHMETIC: ${checked} pages checked, ${mismatches} mismatched`,
	);

	// ── B. BEHAVIOR: census vs the sample production reports today ──
	const sampleRows = (await prisma.behavioralSessionAggregate.findMany({
		where: {
			envId: env.id,
			startedAt: { gte: windowStart, lt: windowEnd },
			eventCount: { gte: MIN_EVENTS_INTERACTIVE },
		},
		orderBy: { startedAt: "desc" },
		take: SAMPLE_CAP,
		select: { timeline: true, urls: true },
	})) as TimelineRowInput[];
	const sample = computeMeasuredFriction(sampleRows, windowStart, windowEnd);

	console.log(
		`\nB. BEHAVIOR CHANGE (sample ${sampleRows.length} -> census ${allRows.length})`,
	);
	const sampleByPath = new Map((sample?.pages ?? []).map((p) => [p.path, p]));
	for (const pg of census?.pages ?? []) {
		const s = sampleByPath.get(pg.path);
		console.log(
			`  ${pg.path}\n` +
				`    sessions:  ${s?.sessions ?? "-"} -> ${pg.sessions}\n` +
				`    friction%: ${s?.frictionRatePct ?? "-"} -> ${pg.frictionRatePct}`,
		);
	}
	const droppedFromTop = (sample?.pages ?? [])
		.map((p) => p.path)
		.filter((p) => !(census?.pages ?? []).some((c) => c.path === p));
	if (droppedFromTop.length) {
		console.log(`  pages leaving the top list: ${droppedFromTop.join(", ")}`);
	}

	// ── C. THE ACTUAL READER ───────────────────────────────────────
	// A and B compare arithmetic. This exercises the function the plan
	// really calls, so a reader that silently fell back to the live
	// scan cannot pass as a reader that used the rollup.
	const { generateMeasuredFriction } = await import(
		"../packages/strategy-plan/sections/measured-friction"
	);
	const real = await generateMeasuredFriction(prisma, {
		environmentId: env.id,
		envDomain: env.domain,
	} as never);
	const usedRollup = (real?.sampleSessions ?? 0) > SAMPLE_CAP;
	console.log(
		`\nC. READER: sampleSessions=${real?.sampleSessions} ` +
			`pages=${real?.pages.length} ` +
			`${usedRollup ? "via ROLLUP" : "via LIVE SCAN (fallback)"}`,
	);
	for (const pg of real?.pages ?? []) {
		console.log(
			`  ${pg.path}  sessions=${pg.sessions} friction=${pg.frictionRatePct}% label="${pg.label}"`,
		);
	}
	if (!usedRollup) {
		console.log("  !! reader did not use the rollup");
	}

	const dupes = (real as unknown as { duplicateEntities?: {
		label: string; totalSessions: number; paths: { path: string; sessions: number }[];
	}[] })?.duplicateEntities;
	if (dupes?.length) {
		console.log("\nD. SAME THING, SEVERAL ADDRESSES");
		for (const d of dupes) {
			console.log(`  ${d.label}  ${d.paths.length} urls, ${d.totalSessions} sessions`);
			for (const pp of d.paths) console.log(`     ${pp.sessions.toString().padStart(7)}  ${pp.path}`);
		}
	}

	await prisma.$disconnect();
	process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
