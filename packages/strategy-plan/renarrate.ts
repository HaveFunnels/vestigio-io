// ──────────────────────────────────────────────
// Wave 22.6 Step 6 — re-narrative trigger router
//
// Called by 4 event sites to fire a partial regeneration when
// something high-signal happens mid-month:
//   - critical_resolve     : UserAction.status → done on a critical
//                            high-impact action (severity=critical AND
//                            impact > R$ 5k)
//   - new_critical         : new severity=critical finding introduced
//                            during a cycle
//   - chronic_detected     : findings that came back for the 3rd+ time
//   - regression_chain     : 3+ regressions detected in a single cycle
//   - probe_surface_change : targeted cycle triggered by probe diff
//                            (cycle.cycleType='targeted' AND
//                             scopeJson.triggered_by='probe_diff')
//
// Each trigger maps to a partial regenScope. The cap of 4 regens per
// env-per-month bounds LLM cost at ~$0.05 in the worst case (matches
// PLAN_MONTHLY_STRATEGY.md §5). When the cap is hit, additional
// triggers are logged but don't fire — the next month's plan reset
// re-opens the budget.
//
// All callers MUST treat this as best-effort: any thrown error from
// here is swallowed to keep the calling event (action update, cycle
// completion, probe pass) from failing.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { generateAndPersistPlan } from "./generator";
import type { RegenScope } from "./generator";

export type RenarrateTrigger =
	| "critical_resolve"
	| "new_critical"
	| "chronic_detected"
	| "regression_chain"
	| "probe_surface_change";

const TRIGGER_TO_SCOPE: Record<RenarrateTrigger, RegenScope> = {
	// Action just resolved — re-prioritize next steps. Narrative
	// stays put; the operator already knows what they fixed.
	critical_resolve: "next_steps",
	// New critical finding — story of the month shifts; next steps
	// shift too (the new finding is likely the new top priority).
	new_critical: "narrative_and_next_steps",
	// Chronic finding detected — story gains a "this is structural"
	// beat AND next steps need to surface the chronic item. A
	// finding hitting its 3rd recurrence often wasn't in the
	// month-start next-step list, so regenerating both keeps the
	// narrative honest with the prioritized work.
	chronic_detected: "narrative_and_next_steps",
	// Multiple regressions — story shifts ("3 regressões esse mês")
	// AND next steps shift (regressions are usually top-priority).
	regression_chain: "narrative_and_next_steps",
	// Major surface change — both story (something happened) and
	// next steps (the change likely created/removed actions).
	probe_surface_change: "narrative_and_next_steps",
};

const MONTHLY_REGEN_CAP = 4;

function currentMonthYYYYMM(now: Date = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MaybeTriggerArgs {
	prisma: PrismaClient;
	trigger: RenarrateTrigger;
	environmentId: string;
	/** Optional metadata for log lines — never persisted. */
	cycleId?: string;
	month?: string; // YYYY-MM. Defaults to the current UTC month.
}

export interface MaybeTriggerResult {
	fired: boolean;
	reason?: "cap_reached" | "no_plan_yet" | "plan_archived" | "plan_failed" | "error";
	scope?: RegenScope;
	regenCountAfter?: number;
}

/**
 * Fire a partial regeneration of the current month's Strategy Plan
 * for the env, gated by the monthly cap. Best-effort: never throws.
 */
export async function maybeTriggerRenarrative(
	args: MaybeTriggerArgs,
): Promise<MaybeTriggerResult> {
	const month = args.month ?? currentMonthYYYYMM();
	const scope = TRIGGER_TO_SCOPE[args.trigger];

	try {
		// Atomic check-and-reserve. Use updateMany with a conditional
		// WHERE so the cap check + increment happen in a single SQL
		// round-trip. If the row exists AND regenCount is still below
		// the cap, the row's `regenCount` is incremented and count=1.
		// Otherwise count=0 — either no plan yet, archived, or capped.
		// This eliminates the read-check-write race where two
		// concurrent triggers could both see "3 < 4" and both fire,
		// landing the counter at 5. Atomic from the DB's perspective.
		// Skip renarrate on terminal-no-retry plans:
		//   - 'archived' = owner intentionally hid (no auto-fix)
		//   - 'failed'   = infra error; monthly cron retries from
		//                  scratch, mid-month renarrate would just
		//                  layer onto broken state.
		const reserved = await args.prisma.monthlyStrategyPlan.updateMany({
			where: {
				environmentId: args.environmentId,
				month,
				status: { notIn: ["archived", "failed"] },
				regenCount: { lt: MONTHLY_REGEN_CAP },
			},
			data: { regenCount: { increment: 1 } },
		});

		if (reserved.count === 0) {
			// Disambiguate why we didn't fire — informational only.
			const plan = await args.prisma.monthlyStrategyPlan.findUnique({
				where: {
					environmentId_month: {
						environmentId: args.environmentId,
						month,
					},
				},
				select: { status: true, regenCount: true },
			});
			if (!plan) return { fired: false, reason: "no_plan_yet" };
			if (plan.status === "archived") return { fired: false, reason: "plan_archived" };
			if (plan.status === "failed") return { fired: false, reason: "plan_failed" };
			console.log(
				`[strategy-plan/renarrate] env=${args.environmentId} month=${month} ` +
					`trigger=${args.trigger} skipped (cap ${MONTHLY_REGEN_CAP} reached)`,
			);
			return { fired: false, reason: "cap_reached" };
		}

		// Cap slot reserved — now actually regenerate. The generator
		// is told NOT to bump regenCount (we already did it above);
		// the suppressRegenCountIncrement flag toggles that off.
		const result = await generateAndPersistPlan(args.prisma, {
			environmentId: args.environmentId,
			month,
			regenScope: scope,
			suppressRegenCountIncrement: true,
		});

		// If every LLM section fell back to deterministic text (no
		// actual LLM cost), refund the reserved slot — the cap is
		// designed to bound LLM cost, not penalize zero-value regens.
		//
		// Known narrow race: between the reservation above and this
		// refund below, a concurrent trigger sees regenCount at the
		// (temporarily-inflated) value and bails with cap_reached
		// when it would otherwise succeed. We accept this rather than
		// hold a tx open across the heavy generator path — the worst
		// case is one false cap-rejection per env per month and the
		// next trigger re-evaluates. Worth revisiting if observability
		// shows it firing repeatedly.
		if (result.output.cost.llmCallsCount === 0) {
			const refund = await args.prisma.monthlyStrategyPlan.updateMany({
				where: { environmentId: args.environmentId, month, regenCount: { gt: 0 } },
				data: { regenCount: { decrement: 1 } },
			});
			// Read back the actual count for observability — surfaces if
			// the refund didn't apply (someone else just consumed it).
			const after = await args.prisma.monthlyStrategyPlan.findUnique({
				where: {
					environmentId_month: {
						environmentId: args.environmentId,
						month,
					},
				},
				select: { regenCount: true },
			});
			console.log(
				`[strategy-plan/renarrate] env=${args.environmentId} month=${month} ` +
					`trigger=${args.trigger} fell back to deterministic text — slot refunded ` +
					`(refundedRows=${refund.count}, regenCountAfter=${after?.regenCount ?? "?"})`,
			);
			return {
				fired: true,
				scope,
				regenCountAfter: after?.regenCount ?? 0,
			};
		}

		console.log(
			`[strategy-plan/renarrate] env=${args.environmentId} month=${month} ` +
				`trigger=${args.trigger} scope=${scope} ` +
				`llmCost=$${(result.output.cost.llmCostCents / 100).toFixed(4)}`,
		);

		return {
			fired: true,
			scope,
		};
	} catch (err) {
		// Best-effort: log and swallow. The triggering event (action
		// done, cycle completion, etc.) must not be blocked by a
		// re-narrative failure.
		console.warn(
			`[strategy-plan/renarrate] env=${args.environmentId} trigger=${args.trigger} threw:`,
			err instanceof Error ? err.message : err,
		);
		return { fired: false, reason: "error" };
	}
}
