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

export interface GeneratePlanArgs {
	environmentId: string;
	month: string; // 'YYYY-MM'
	locale?: "pt-BR" | "en" | "es" | "de";
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
 * Run all sub-generators and assemble the PlanGeneratorOutput.
 * Does NOT touch the DB — pure compute. Use persistPlan() to write
 * the result to MonthlyStrategyPlan + PlanNextStep.
 */
export async function generatePlan(
	prisma: PrismaClient,
	args: GeneratePlanArgs,
): Promise<PlanGeneratorOutput> {
	const { ctx, organizationId } = await buildContext(prisma, args);

	// Deterministic sections run in parallel — no LLM, no ordering.
	const [heroMetrics, buyerSegments, valuePreview, memoryRollups] = await Promise.all([
		generateHeroMetrics(prisma, ctx),
		generateBuyerSegments(prisma, ctx),
		generateValuePreview(prisma, ctx),
		generateMemoryRollups(prisma, ctx),
	]);

	// LLM sections — fire in parallel since each owns its purpose tag.
	// The narrative blob is independent of value-preview, but value-
	// preview-narrative consumes the structured valuePreview above.
	const [narrative, valuePreviewNarrative, nextStepsResult] = await Promise.all([
		generateNarrativeWhatHappened(prisma, ctx, organizationId),
		generateValuePreviewNarrative(prisma, ctx, valuePreview, organizationId),
		generateNextSteps(prisma, ctx, organizationId),
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
	};
}

/**
 * Run generatePlan and persist the result into MonthlyStrategyPlan
 * + PlanNextStep. Returns the planId. Idempotent on (envId, month).
 */
export async function generateAndPersistPlan(
	prisma: PrismaClient,
	args: GeneratePlanArgs,
): Promise<{ planId: string; output: PlanGeneratorOutput }> {
	// 1. Mark generating + delete prior next-step rows. Done in a
	//    transaction so a re-gen never leaves the customer staring at
	//    half a stale plan.
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
		update: {
			status: "generating",
			lastRegenerated: new Date(),
		},
		select: { id: true },
	});

	try {
		const output = await generatePlan(prisma, args);

		// 2. Write the structured + narrative columns inside a tx so
		//    next-step rows can't desync from the plan they belong to.
		await prisma.$transaction(async (tx: any) => {
			await tx.monthlyStrategyPlan.update({
				where: { id: placeholder.id },
				data: {
					status: "ready",
					locale: args.locale ?? "pt-BR",
					lastRegenerated: new Date(),
					heroMetricsJson: output.heroMetrics as any,
					buyerSegmentsJson: output.buyerSegments as any,
					memoryRollupsJson: output.memoryRollups as any,
					valuePreviewJson: output.valuePreview as any,
					narrativeWhatHappened: output.narrativeWhatHappened,
					valuePreviewNarrative: output.valuePreviewNarrative,
					llmCallsCount: { increment: output.cost.llmCallsCount },
					llmCostCents: { increment: output.cost.llmCostCents },
				},
			});

			// Replace next-step rows wholesale on regen. We could diff but
			// the row count is tiny (max 5) and a clean replace avoids
			// PlanNextStep.status drift across re-narrative events.
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
		});

		return { planId: placeholder.id, output };
	} catch (err) {
		// Infrastructure failure (DB, cycle metadata) — mark the plan
		// failed so the UI surfaces a recoverable state and the next
		// cron pass retries. LLM failures don't land here (they fall
		// back to deterministic text inside the sub-generators).
		await prisma.monthlyStrategyPlan
			.update({
				where: { id: placeholder.id },
				data: { status: "archived" },
			})
			.catch(() => {});
		throw err;
	}
}
