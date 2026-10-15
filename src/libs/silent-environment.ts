// ──────────────────────────────────────────────
// An environment that stopped being analysed, and nobody noticed.
//
// The heal cron watches cycles that HANG: stale heartbeat, phase
// stuck, created-but-never-started. Nothing watched for cycles that
// never start at all, and that is the failure that actually
// happened. Casa Montelle, a paying Max customer, produced 160
// cycles on 2026-10-09 and then nothing of any kind until 10-14. The
// gap was only visible by grouping cycles per day per environment,
// so it ran for four days unnoticed and ended because the owner
// happened to open the app.
//
// Two shapes are checked, because the incident had one and the fix
// for it creates the other:
//
//   silent  — not paused, so the scheduler SHOULD be producing
//             cycles at the plan's cadence, and is not. Something
//             downstream is broken.
//
//   paused  — a paying, active org is paused at all. Since paying
//             customers are no longer inactivity-pauseable (see
//             inactivity-pause-policy.ts), the only legitimate pause
//             left for them is operator_disabled, which is a
//             deliberate call. Anything else is the 10-09 incident
//             happening again by another route.
//
// Deliberately NOT a threshold rule in AlertRule/AlertEvent. That
// system is configured per metric and has no rows in production; a
// structural invariant should not depend on someone having set up a
// rule for it.
// ──────────────────────────────────────────────

import { getCadenceForPlan } from "@/libs/plan-config";

/**
 * How many cold-cycle intervals of total silence before an
 * environment counts as broken rather than merely between cycles.
 *
 * Cold is the slowest cadence a plan guarantees, so it is the only
 * one whose absence is unambiguous: a Max env missing its 15-minute
 * hot cycles might be queue backpressure, but a Max env with no
 * cycle of ANY type for two days is not working. Two gives one full
 * interval of grace.
 */
export const SILENCE_COLD_INTERVALS = 2;

export type SilenceKind = "silent" | "unexpectedly_paused";

export interface SilenceFinding {
	envId: string;
	domain: string | null;
	kind: SilenceKind;
	/** Hours since the most recent cycle, null when there never was one. */
	hoursSinceLastCycle: number | null;
	/** Hours of silence past which this env counts as broken. */
	thresholdHours: number;
	detail: string;
}

export interface EnvForSilenceCheck {
	id: string;
	domain: string | null;
	activated: boolean;
	continuousPaused: boolean;
	pausedReason: string | null;
	createdAt: Date;
	lastCycleAt: Date | null;
	orgType: string | null;
	orgStatus: string | null;
	plan: string | null;
}

/**
 * Classify one environment. Pure, so the rule can be asserted
 * without a database.
 */
export function classifyEnvironmentSilence(
	env: EnvForSilenceCheck,
	now: Date = new Date(),
): SilenceFinding | null {
	// Never activated: there is nothing to be silent about yet.
	if (!env.activated) return null;
	// Demo environments are fixtures, not customers.
	if (env.orgType === "demo") return null;

	const cadence = getCadenceForPlan(env.plan || "vestigio");
	const thresholdMs = cadence.coldMs * SILENCE_COLD_INTERVALS;
	const thresholdHours = Math.round(thresholdMs / 3_600_000);

	if (env.continuousPaused) {
		// A trial going quiet is the pause working as designed.
		const paying = env.orgType === "customer" && env.orgStatus === "active";
		if (!paying) return null;
		// Someone turned this off on purpose.
		if (env.pausedReason === "operator_disabled") return null;
		return {
			envId: env.id,
			domain: env.domain,
			kind: "unexpectedly_paused",
			hoursSinceLastCycle: env.lastCycleAt
				? Math.round((now.getTime() - env.lastCycleAt.getTime()) / 3_600_000)
				: null,
			thresholdHours,
			detail:
				`paying org is paused (reason: ${env.pausedReason ?? "none recorded"}). ` +
				"A paused environment produces no cycles of any kind, and only operator_disabled is a deliberate stop.",
		};
	}

	// Unpaused: the scheduler should be producing cycles. Measure from
	// the last cycle, or from creation when there has never been one,
	// so a provisioned-but-never-run environment is caught too.
	const since = env.lastCycleAt ?? env.createdAt;
	const elapsedMs = now.getTime() - since.getTime();
	if (elapsedMs <= thresholdMs) return null;

	const hours = Math.round(elapsedMs / 3_600_000);
	return {
		envId: env.id,
		domain: env.domain,
		kind: "silent",
		hoursSinceLastCycle: env.lastCycleAt ? hours : null,
		thresholdHours,
		detail: env.lastCycleAt
			? `no cycle of any type for ${hours}h, against a ${thresholdHours}h bar for plan "${env.plan || "vestigio"}".`
			: `activated ${hours}h ago and has never produced a cycle.`,
	};
}

/** Load every environment with its last cycle time and classify. */
export async function findSilentEnvironments(
	prisma: import("@prisma/client").PrismaClient,
	now: Date = new Date(),
): Promise<SilenceFinding[]> {
	const envs = await prisma.environment.findMany({
		where: { activated: true },
		select: {
			id: true,
			domain: true,
			activated: true,
			continuousPaused: true,
			pausedReason: true,
			createdAt: true,
			organization: { select: { orgType: true, status: true, plan: true } },
		},
	});
	if (envs.length === 0) return [];

	// One grouped query rather than N lookups: this runs hourly over
	// every environment, and the per-env version is the shape that
	// stops being affordable exactly when there are enough customers
	// for the check to matter.
	const last = await prisma.auditCycle.groupBy({
		by: ["environmentId"],
		where: { environmentId: { in: envs.map((e) => e.id) } },
		_max: { createdAt: true },
	});
	const lastByEnv = new Map(last.map((r) => [r.environmentId, r._max.createdAt]));

	const out: SilenceFinding[] = [];
	for (const e of envs) {
		const finding = classifyEnvironmentSilence(
			{
				id: e.id,
				domain: e.domain,
				activated: e.activated,
				continuousPaused: e.continuousPaused,
				pausedReason: e.pausedReason,
				createdAt: e.createdAt,
				lastCycleAt: lastByEnv.get(e.id) ?? null,
				orgType: e.organization?.orgType ?? null,
				orgStatus: e.organization?.status ?? null,
				plan: e.organization?.plan ?? null,
			},
			now,
		);
		if (finding) out.push(finding);
	}
	return out;
}
