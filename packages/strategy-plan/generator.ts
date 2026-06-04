// ──────────────────────────────────────────────
// Strategy Plan generator — top-level orchestration
//
// Composes the 6 sub-generators in parallel where possible:
//   - Hero metrics    (SQL)
//   - Buyer segments  (SQL)
//   - Memory rollups  (SQL)
//   - Value preview   (SQL)
//   - Narrative       (Sonnet 4.6 — ~$0.015/plan)
//   - Next steps × 5  (Haiku 4.5 — ~$0.010/plan)
//   - Value preview narrative (Haiku 4.5 — ~$0.001/plan)
//
// Persists the output into MonthlyStrategyPlan + PlanNextStep rows.
// Status transitions: generating → ready (on success) | failed
// (on infrastructure error — never on LLM failure, which uses
// deterministic fallbacks instead).
//
// Idempotent: if a plan already exists for (envId, month), the
// row is updated and llmCostCents accumulates across regens. The
// generatedAt timestamp stays at the initial generation; only
// lastRegenerated bumps.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, PlanGeneratorOutput } from "./types";
import { generateHeroMetrics } from "./sections/hero-metrics";
import { generateBuyerSegments } from "./sections/buyer-segments";
import { generateMemoryRollups } from "./sections/memory-rollups";
import { generateValuePreview } from "./sections/value-preview";
import { generateNarrativeWhatHappened } from "./sections/narrative";
import { generateValuePreviewNarrative } from "./sections/value-preview-narrative";
import { generateNextSteps } from "./sections/next-steps";

/**
 * Wave 22.6 Step 6 — partial regen scope. Each event trigger asks for
 * the narrowest scope that captures the change it just saw:
 *   - "all": full regeneration (day-1 cron + first-cycle path).
 *   - "narrative": regenerate the "O que aconteceu" paragraph only.
 *     Used by chronic_detected + new_critical triggers (they change
 *     the story of the month without necessarily reordering the work).
 *   - "next_steps": regenerate top-5 next steps only. Used by
 *     critical_resolve (action just done — re-prioritize what's next).
 *   - "narrative_and_next_steps": both above. Used by regression_chain
 *     and probe_surface_change (story AND priority both shift).
 *
 * Deterministic sections (hero metrics, buyer segments, memory rollups,
 * value preview structure) re-run on every regen regardless — they're
 * pure SQL and cost $0, and stale tile numbers are a worse UX bug than
 * a few wasted milliseconds.
 */
export type RegenScope =
	| "all"
	| "narrative"
	| "next_steps"
	| "narrative_and_next_steps";

export interface GeneratePlanArgs {
	environmentId: string;
	month: string; // 'YYYY-MM'
	locale?: "pt-BR" | "en" | "es" | "de";
	/** Default 'all'. Event-driven re-narrative paths pass narrower
	    scopes to keep cost capped. */
	regenScope?: RegenScope;
	/** Internal flag set by renarrate.ts after it has atomically
	    reserved a cap slot via updateMany. Prevents double-increment
	    of regenCount inside generateAndPersistPlan's own update. */
	suppressRegenCountIncrement?: boolean;
	/** Wave 22.6 — caller-supplied side-effect for full regenerations
	    (scope='all') that signals the plan is ready to consume. The
	    generator package stays src/-isolated; notification dispatch +
	    any other downstream work lives at the call site. Best-effort
	    (errors are swallowed by the caller). */
	onReady?: (args: {
		planId: string;
		environmentId: string;
		month: string;
		isFirstPlan: boolean;
		heroMetrics: {
			retainedMid: number;
			capturedMid: number;
			criticalCount: number;
		};
	}) => Promise<void> | void;
}

/**
 * Build the GenerateContext from minimal args. Resolves the env's
 * domain + the org's locale via Prisma.
 */
async function buildContext(
	prisma: PrismaClient,
	args: GeneratePlanArgs,
): Promise<{ ctx: GenerateContext; organizationId: string | null }> {
	const env = await prisma.environment.findUnique({
		where: { id: args.environmentId },
		select: {
			id: true,
			domain: true,
			organization: { select: { id: true, locale: true } },
		},
	});
	if (!env) throw new Error(`Environment not found: ${args.environmentId}`);

	const [year, mm] = args.month.split("-");
	const monthStart = new Date(Date.UTC(parseInt(year, 10), parseInt(mm, 10) - 1, 1));
	const monthEnd = new Date(Date.UTC(parseInt(year, 10), parseInt(mm, 10), 1));

	const locale: GenerateContext["locale"] =
		args.locale ?? (env.organization?.locale as any) ?? "pt-BR";

	return {
		ctx: {
			environmentId: env.id,
			envDomain: env.domain,
			month: args.month,
			locale,
			monthStart,
			monthEnd,
		},
		organizationId: env.organization?.id ?? null,
	};
}

/**
 * Run sub-generators and assemble the PlanGeneratorOutput. Does NOT
 * touch the DB — pure compute. Use generateAndPersistPlan() to write
 * the result to MonthlyStrategyPlan + PlanNextStep.
 *
 * regenScope (default 'all') controls which LLM sections are
 * regenerated. Deterministic sections always rerun. Skipped sections
 * return null so the persistence layer knows not to overwrite the
 * existing DB column.
 */
export async function generatePlan(
	prisma: PrismaClient,
	args: GeneratePlanArgs,
): Promise<PlanGeneratorOutput & {
	regenScope: RegenScope;
	skipped: { narrative: boolean; nextSteps: boolean; valuePreviewNarrative: boolean };
}> {
	const { ctx, organizationId } = await buildContext(prisma, args);
	const scope: RegenScope = args.regenScope ?? "all";

	const wantNarrative = scope === "all" || scope === "narrative" || scope === "narrative_and_next_steps";
	const wantNextSteps = scope === "all" || scope === "next_steps" || scope === "narrative_and_next_steps";
	// value-preview narrative only regenerates on 'all' — it's cheap
	// ($0.001) but its content rarely shifts on event triggers.
	const wantValuePreviewNarrative = scope === "all";

	// Deterministic sections run in parallel — no LLM, no ordering.
	const [heroMetrics, buyerSegments, valuePreview, memoryRollups] = await Promise.all([
		generateHeroMetrics(prisma, ctx),
		generateBuyerSegments(prisma, ctx),
		generateValuePreview(prisma, ctx),
		generateMemoryRollups(prisma, ctx),
	]);

	// LLM sections — only fire the ones the scope asks for. Skipped
	// sections resolve to empty placeholder shapes; the persistence
	// layer detects them via the `skipped` flag below and preserves
	// the existing DB content for those columns.
	const [narrative, valuePreviewNarrative, nextStepsResult] = await Promise.all([
		wantNarrative
			? generateNarrativeWhatHappened(prisma, ctx, organizationId)
			: Promise.resolve({ text: "", callsCount: 0, costCents: 0, fallback: false }),
		wantValuePreviewNarrative
			? generateValuePreviewNarrative(prisma, ctx, valuePreview, organizationId)
			: Promise.resolve({ text: "", callsCount: 0, costCents: 0, fallback: false }),
		wantNextSteps
			? generateNextSteps(prisma, ctx, organizationId)
			: Promise.resolve({ steps: [], cost: { llmCallsCount: 0, llmCostCents: 0 } }),
	]);

	const llmCallsCount =
		narrative.callsCount +
		valuePreviewNarrative.callsCount +
		nextStepsResult.cost.llmCallsCount;
	const llmCostCents =
		narrative.costCents +
		valuePreviewNarrative.costCents +
		nextStepsResult.cost.llmCostCents;

	// Cycle number = how many completed cycles preceded this plan's
	// month. Used by the Plan header ("Ciclo #N").
	const cycleNumber = await prisma.auditCycle.count({
		where: {
			environmentId: ctx.environmentId,
			status: "complete",
			createdAt: { lt: ctx.monthEnd },
		},
	});

	return {
		heroMetrics,
		buyerSegments,
		narrativeWhatHappened: narrative.text,
		valuePreview,
		valuePreviewNarrative: valuePreviewNarrative.text,
		memoryRollups,
		nextSteps: nextStepsResult.steps,
		cost: { llmCallsCount, llmCostCents },
		cycleNumber,
		regenScope: scope,
		skipped: {
			narrative: !wantNarrative,
			nextSteps: !wantNextSteps,
			valuePreviewNarrative: !wantValuePreviewNarrative,
		},
	};
}

/**
 * Run generatePlan and persist the result into MonthlyStrategyPlan
 * + PlanNextStep. Returns the planId. Idempotent on (envId, month).
 */
export async function generateAndPersistPlan(
	prisma: PrismaClient,
	args: GeneratePlanArgs,
): Promise<{ planId: string; output: PlanGeneratorOutput; regenScope: RegenScope }> {
	const scope: RegenScope = args.regenScope ?? "all";

	// 1. Mark generating + delete prior next-step rows. Done in a
	//    transaction so a re-gen never leaves the customer staring at
	//    half a stale plan. For partial regens (scope !== 'all') we
	//    DON'T flip status to 'generating' — the existing 'ready' plan
	//    keeps rendering to the customer while we work in the
	//    background. Only full regens block the UI with the spinner.
	const placeholder = await prisma.monthlyStrategyPlan.upsert({
		where: {
			environmentId_month: {
				environmentId: args.environmentId,
				month: args.month,
			},
		},
		create: {
			environmentId: args.environmentId,
			month: args.month,
			locale: args.locale ?? "pt-BR",
			status: "generating",
			heroMetricsJson: {},
			buyerSegmentsJson: [],
			memoryRollupsJson: {},
			valuePreviewJson: {},
			narrativeWhatHappened: "",
			valuePreviewNarrative: "",
		},
		update:
			scope === "all"
				? { status: "generating", lastRegenerated: new Date() }
				: { lastRegenerated: new Date() },
		select: { id: true },
	});

	try {
		const output = await generatePlan(prisma, args);

		// 2. Write columns in a tx. Skipped LLM columns are preserved
		//    by simply omitting them from the update payload; the
		//    existing DB content keeps rendering. Deterministic
		//    sections always overwrite (cheap + recompute is the point).
		await prisma.$transaction(async (tx: any) => {
			const updateData: any = {
				status: "ready",
				locale: args.locale ?? "pt-BR",
				lastRegenerated: new Date(),
				heroMetricsJson: output.heroMetrics as any,
				buyerSegmentsJson: output.buyerSegments as any,
				memoryRollupsJson: output.memoryRollups as any,
				valuePreviewJson: output.valuePreview as any,
				llmCallsCount: { increment: output.cost.llmCallsCount },
				llmCostCents: { increment: output.cost.llmCostCents },
			};
			if (!output.skipped.narrative) {
				updateData.narrativeWhatHappened = output.narrativeWhatHappened;
			}
			if (!output.skipped.valuePreviewNarrative) {
				updateData.valuePreviewNarrative = output.valuePreviewNarrative;
			}
			// Partial regens count against the monthly cap. Full regens
			// (scope='all') don't — they're either the day-1 cron or
			// the first-cycle trigger, both ungated. When called from
			// renarrate.ts the slot has already been reserved
			// atomically — suppressRegenCountIncrement avoids a second
			// bump that would skew the count.
			if (scope !== "all" && !args.suppressRegenCountIncrement) {
				updateData.regenCount = { increment: 1 };
			}

			await tx.monthlyStrategyPlan.update({
				where: { id: placeholder.id },
				data: updateData,
			});

			// Replace next-step rows ONLY when the scope asked for them.
			// Partial regens (scope='narrative') preserve the existing
			// next-step rows + their member-editable state (status,
			// assignee, dueAt). Clean wholesale replace on full regen
			// keeps PlanNextStep.status drift bounded.
			if (!output.skipped.nextSteps) {
				await tx.planNextStep.deleteMany({ where: { planId: placeholder.id } });
				if (output.nextSteps.length > 0) {
					await tx.planNextStep.createMany({
						data: output.nextSteps.map((s) => ({
							planId: placeholder.id,
							order: s.order,
							title: s.title,
							reasoning: s.reasoning,
							procedureStepsJson: s.procedureSteps as any,
							researchRefsJson: s.researchRefs as any,
							estimatedEffort: s.estimatedEffort,
							suggestedOwner: s.suggestedOwner,
							linkedActionRefsJson: s.linkedActionRefs as any,
						})),
					});
				}
			}
		});

		// Wave 22.6 Step 7 — fire the onReady callback ONLY on full
		// regenerations (scope === 'all'). Partial regens are
		// event-driven and would spam the operator with one email per
		// triggered narrative refresh. "isFirstPlan" means no PRIOR-
		// MONTH plan exists for this env (scoping to month < args.month
		// keeps the first-plan status correct under any race between
		// concurrent generations of the same month). Best-effort.
		if (scope === "all" && args.onReady) {
			const onReady = args.onReady;
			void (async () => {
				try {
					const olderPlanCount = await prisma.monthlyStrategyPlan.count({
						where: {
							environmentId: args.environmentId,
							month: { lt: args.month },
						},
					});
					await onReady({
						planId: placeholder.id,
						environmentId: args.environmentId,
						month: args.month,
						isFirstPlan: olderPlanCount === 0,
						heroMetrics: {
							retainedMid: output.heroMetrics.retainedMid,
							capturedMid: output.heroMetrics.capturedMid,
							criticalCount: output.heroMetrics.criticalCount,
						},
					});
				} catch (notifErr) {
					console.warn(
						`[strategy-plan/generator] onReady callback failed for plan ${placeholder.id}:`,
						notifErr instanceof Error ? notifErr.message : notifErr,
					);
				}
			})();
		}

		return { planId: placeholder.id, output, regenScope: scope };
	} catch (err) {
		// Infrastructure failure (DB, cycle metadata) — mark with the
		// dedicated 'failed' status. Distinct from 'archived':
		//   - 'failed' = infra error, plan visible in the library as
		//     a recoverable state, next cron retries it automatically.
		//   - 'archived' = owner intentionally hid the plan (RBAC-gated
		//     admin action); cron does NOT retry archived plans.
		// LLM failures don't land here — sub-generators fall back to
		// deterministic text.
		await prisma.monthlyStrategyPlan
			.update({
				where: { id: placeholder.id },
				data: { status: "failed" },
			})
			.catch(() => {});
		throw err;
	}
}
