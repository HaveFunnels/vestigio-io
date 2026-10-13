/**
 * Finding retention — pruneOlderThan regression tests.
 *
 * This bug class has shipped to production twice:
 *
 *   2026-07  casamontelle: 577 TARGETED cycles dominating recent
 *            history wiped every full-engine cycle's findings within
 *            ~10 minutes of write. Fixed by only counting cycles that
 *            actually own Finding rows (targeted emit zero).
 *
 *   2026-09  havefunnels (plan Max): HOT (15min) and WARM (1h) cycles
 *            DO emit findings, so they permanently occupy the 2-slot
 *            keep window and the daily COLD cycle's findings were
 *            deleted within the hour. Because
 *            honest-aggregates.openLossExposure scopes to
 *            latestComprehensiveCycleId() (full/cold only), the Sept
 *            AND Oct plans shipped with R$0 exposure, empty buyer
 *            segments and zero next-steps.
 *
 * The invariant both failures violate: the newest comprehensive
 * (full/cold) cycle's findings must survive any prune, because they
 * are the sole input to the exposure aggregate.
 *
 * Run: npx tsx tests/finding-retention.test.ts
 */

import { test, assert, assertEqual, printResults, resetCounters } from "./helpers";
import { PrismaFindingStore } from "../packages/projections/prisma-finding-store";

interface FakeCycle {
	id: string;
	cycleType: string;
	createdAt: Date;
	status: string;
	findingCount: number;
}

/** Minimal Prisma stub covering only what pruneOlderThan touches. */
function makePrisma(cycles: FakeCycle[]) {
	const deleted: string[] = [];
	const owning = () => cycles.filter((c) => c.findingCount > 0);

	const prisma = {
		finding: {
			groupBy: async () =>
				owning().map((c) => ({ cycleId: c.id, _count: { _all: c.findingCount } })),
			deleteMany: async ({ where }: any) => {
				const ids: string[] = where.cycleId.in;
				deleted.push(...ids);
				const count = cycles
					.filter((c) => ids.includes(c.id))
					.reduce((a, c) => a + c.findingCount, 0);
				return { count };
			},
		},
		auditCycle: {
			findMany: async ({ where, take }: any) =>
				cycles
					.filter(
						(c) =>
							c.status === where.status &&
							(where.id?.in ? where.id.in.includes(c.id) : true),
					)
					.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
					.slice(0, take)
					.map((c) => ({ id: c.id })),
			findFirst: async ({ where }: any) => {
				const types: string[] | undefined = where.cycleType?.in;
				const match = cycles
					.filter(
						(c) =>
							c.status === where.status &&
							(types ? types.includes(c.cycleType) : true) &&
							(where.id?.in ? where.id.in.includes(c.id) : true),
					)
					.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
				return match ? { id: match.id } : null;
			},
		},
	};
	return { prisma, deleted };
}

const d = (iso: string) => new Date(iso);

async function main() {
	resetCounters();

	// ── The havefunnels Max-cadence scenario ──
	// A cold cycle runs daily; hot/warm run every 15min/1h and also
	// emit findings. Under keep-2 the cold cycle is evicted the moment
	// two newer hot/warm cycles land.
	{
		const cycles: FakeCycle[] = [
			{ id: "cold-1", cycleType: "cold", createdAt: d("2026-10-09T02:20:00Z"), status: "complete", findingCount: 19 },
			{ id: "hot-1", cycleType: "hot", createdAt: d("2026-10-09T12:20:00Z"), status: "complete", findingCount: 19 },
			{ id: "warm-1", cycleType: "warm", createdAt: d("2026-10-09T13:20:00Z"), status: "complete", findingCount: 19 },
		];
		const { prisma, deleted } = makePrisma(cycles);
		const store = new PrismaFindingStore(prisma as any);
		await store.pruneOlderThan("env-hf", 2);

		test("cold-cycle findings survive a keep-2 prune on Max cadence", () => {
			assert(
				!deleted.includes("cold-1"),
				`cold cycle was pruned — exposure aggregate would read zero. deleted=${JSON.stringify(deleted)}`,
			);
		});
	}

	// ── The regression must not disable pruning ──
	// Older comprehensive cycles are still fair game; only the NEWEST
	// one is spared.
	{
		const cycles: FakeCycle[] = [
			{ id: "cold-old", cycleType: "cold", createdAt: d("2026-10-01T02:00:00Z"), status: "complete", findingCount: 11 },
			{ id: "cold-new", cycleType: "cold", createdAt: d("2026-10-09T02:00:00Z"), status: "complete", findingCount: 19 },
			{ id: "hot-1", cycleType: "hot", createdAt: d("2026-10-09T12:00:00Z"), status: "complete", findingCount: 19 },
			{ id: "warm-1", cycleType: "warm", createdAt: d("2026-10-09T13:00:00Z"), status: "complete", findingCount: 19 },
		];
		const { prisma, deleted } = makePrisma(cycles);
		const store = new PrismaFindingStore(prisma as any);
		await store.pruneOlderThan("env-hf", 2);

		test("superseded comprehensive cycles are still pruned", () => {
			assert(deleted.includes("cold-old"), "stale cold cycle should have been pruned");
			assert(!deleted.includes("cold-new"), "newest cold cycle must be spared");
		});
	}

	// ── The 2026-07 casamontelle scenario stays fixed ──
	// Targeted cycles emit no findings, so they never enter the window
	// and the full cycle survives on its own.
	{
		const cycles: FakeCycle[] = [
			{ id: "full-1", cycleType: "full", createdAt: d("2026-09-25T13:04:00Z"), status: "complete", findingCount: 21 },
			...Array.from({ length: 20 }, (_, i) => ({
				id: `targeted-${i}`,
				cycleType: "targeted",
				createdAt: d(`2026-09-26T0${i % 10}:00:00Z`),
				status: "complete",
				findingCount: 0,
			})),
		];
		const { prisma, deleted } = makePrisma(cycles);
		const store = new PrismaFindingStore(prisma as any);
		await store.pruneOlderThan("env-cm", 2);

		test("targeted cycles cannot evict a full cycle (2026-07 regression)", () => {
			assert(!deleted.includes("full-1"), "full cycle was pruned by targeted cycles");
		});
	}

	// ── No comprehensive cycle at all ──
	// A brand-new env whose only cycles are hot/warm must still prune
	// normally rather than throwing or sparing everything.
	{
		const cycles: FakeCycle[] = [
			{ id: "hot-0", cycleType: "hot", createdAt: d("2026-10-09T10:00:00Z"), status: "complete", findingCount: 5 },
			{ id: "hot-1", cycleType: "hot", createdAt: d("2026-10-09T11:00:00Z"), status: "complete", findingCount: 5 },
			{ id: "hot-2", cycleType: "hot", createdAt: d("2026-10-09T12:00:00Z"), status: "complete", findingCount: 5 },
		];
		const { prisma, deleted } = makePrisma(cycles);
		const store = new PrismaFindingStore(prisma as any);
		const pruned = await store.pruneOlderThan("env-new", 2);

		test("env with no comprehensive cycle still prunes to keepCount", () => {
			// join() so the helper's assertEqual compares values, not
			// array identity.
			assertEqual(deleted.join(","), "hot-0", "oldest hot cycle should be pruned");
			assertEqual(pruned, 5, "pruned row count");
		});
	}

	printResults("Finding retention");
}

main();
