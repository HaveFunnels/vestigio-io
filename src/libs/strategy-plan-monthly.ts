// ──────────────────────────────────────────────
// Strategy Plan — monthly cron worker (Wave 22.6 Step 5)
//
// Runs once per day, leader-elected. On the first 7 days of every
// month, generates a `MonthlyStrategyPlan` for each eligible env
// whose plan for the current month hasn't been created yet.
//
// Why daily and not monthly: a monthly cron is fragile — one missed
// tick = a customer doesn't get their plan. Daily-with-idempotency
// is the battle-tested shape every periodic-report worker in this
// codebase already uses (see value-caught-monthly.ts).
//
// Idempotency: `MonthlyStrategyPlan.@@unique([environmentId, month])`
// is the lock. We skip envs that already have a plan for the target
// month (unless its status is 'archived' — those re-generate so a
// failed prior run doesn't trap the env without a plan forever).
//
// First-cycle path lives in apps/audit-runner/run-cycle.ts post-
// completion hook: when the FIRST complete cycle for an env lands,
// the plan generates immediately (regardless of day-of-month). This
// worker only covers ongoing monthly cadence.
// ──────────────────────────────────────────────

import { prisma } from "./prismaDb";
import { generateAndPersistPlan } from "../../packages/strategy-plan";
import { triggerStrategyPlanReadyEmail } from "./notification-triggers";

interface RunResult {
	envsEvaluated: number;
	plansGenerated: number;
	skipped: number;
	errors: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FIRST_N_DAYS = 7;

export async function runMonthlyStrategyPlanPass(
	now: Date = new Date(),
): Promise<RunResult> {
	// Target the CURRENT month. The plan summarizes the trailing month
	// (1m memory rollup, value-caught etc), so generation in the early
	// days of month M produces a "Plano de M" document.
	const monthStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
	);
	const monthYYYYMM = `${monthStart.getUTCFullYear()}-${String(
		monthStart.getUTCMonth() + 1,
	).padStart(2, "0")}`;

	const daysIntoMonth = Math.floor(
		(now.getTime() - monthStart.getTime()) / MS_PER_DAY,
	);
	if (daysIntoMonth >= FIRST_N_DAYS) {
		// Past the delivery window — bail. Anyone who didn't get a plan
		// in the first 7 days will be caught by the first-cycle trigger
		// or by manual admin trigger; we don't want to silently fan out
		// plans late in the month.
		return { envsEvaluated: 0, plansGenerated: 0, skipped: 0, errors: 0 };
	}

	let envsEvaluated = 0;
	let plansGenerated = 0;
	let skipped = 0;
	let errors = 0;

	// Eligible envs — same predicate as value-caught-monthly: active,
	// not paused, org not suspended, at least one completed audit.
	const envs = await prisma.environment.findMany({
		where: {
			activated: true,
			continuousPaused: false,
			organization: { status: "active" },
			auditCycles: { some: { status: "complete" } },
		},
		select: {
			id: true,
			domain: true,
			organization: { select: { id: true, locale: true, ownerId: true } },
		},
	});

	for (const env of envs) {
		envsEvaluated++;

		// Idempotency check — skip if a plan for this month already
		// exists in a final state. The cron retries 'failed' (infra
		// errors that left the plan unusable) but never overwrites a
		// healthy plan or one the owner explicitly archived. The
		// @@unique constraint guards anyway; this early skip avoids
		// a transient 'generating' state visible to the customer.
		const existing = await prisma.monthlyStrategyPlan.findUnique({
			where: {
				environmentId_month: {
					environmentId: env.id,
					month: monthYYYYMM,
				},
			},
			select: { id: true, status: true },
		});
		if (existing && existing.status !== "failed") {
			skipped++;
			continue;
		}

		try {
			const locale =
				((env.organization?.locale ?? "pt-BR") as "pt-BR" | "en" | "es" | "de");
			const ownerId = env.organization?.ownerId ?? null;
			await generateAndPersistPlan(prisma, {
				environmentId: env.id,
				month: monthYYYYMM,
				locale,
				// Day-1 cron always runs full regen — partial scopes are
				// reserved for event-driven triggers (see renarrate.ts).
				regenScope: "all",
				onReady: ownerId
					? async (ready) => {
						await triggerStrategyPlanReadyEmail({
							userId: ownerId,
							environmentId: ready.environmentId,
							domain: env.domain,
							month: ready.month,
							heroMetrics: ready.heroMetrics,
							isFirstPlan: ready.isFirstPlan,
						});
					}
					: undefined,
			});
			plansGenerated++;
		} catch (err) {
			errors++;
			console.error(
				`[strategy-plan-monthly] env=${env.id} (${env.domain}) failed:`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return { envsEvaluated, plansGenerated, skipped, errors };
}
