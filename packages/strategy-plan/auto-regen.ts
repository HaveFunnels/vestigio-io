/**
 * Auto-regen policy for Monthly Strategy Plans.
 *
 * Wave 22.9 — the plan is a persisted snapshot generated on day 1 of
 * the month + refreshed by the weekly cron. Between refreshes, new
 * findings can arrive from continuous audit cycles and leave the
 * plan's heroMetricsJson / memoryRollupsJson visibly stale ("Vazando
 * agora: R$ 0" while the findings table shows R$ 45k in open
 * exposure).
 *
 * This module answers: "given a just-completed cycle, should we
 * regenerate the current-month plan RIGHT NOW?" The decision is
 * driven by:
 *   1. A plan exists for the env's current month (if not, day-1 cron
 *      handles first creation — not our job).
 *   2. Cooldown — no regen for AUTO_REGEN_COOLDOWN_MS after the last
 *      lastRegenerated so a burst of cycles doesn't thrash the LLM
 *      bill.
 *   3. Material divergence — the plan's exposureMid vs current
 *      aggregate must differ by >= AUTO_REGEN_DIVERGENCE_THRESHOLD.
 *      A 20% swing usually means new open findings (or resolutions)
 *      the plan hasn't accounted for.
 *
 * Cost envelope: cooldown of 6h means at most 4 regens/day/env. At
 * ~$0.02 per regen (Haiku is cheap), the worst-case bill is
 * ~$0.08/day/env — sub-buck for even a full month at cap. Real
 * cadence lands closer to 1-3/month because divergence only clears
 * the threshold when meaningful state changed.
 */

import type { PrismaClient } from "@prisma/client";

const AUTO_REGEN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const AUTO_REGEN_DIVERGENCE_THRESHOLD = 0.2; // 20%

function ymNowUtc(): string {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthWindow(month: string): { start: Date; end: Date } {
	const [y, m] = month.split("-").map(Number);
	const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
	const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
	return { start, end };
}

/**
 * Compute the CURRENT open-exposure aggregate for an env — same shape
 * as hero-metrics.ts uses, deduped here so the auto-regen decision
 * doesn't have to boot the whole generator just to compare a number.
 */
async function currentExposureMid(
	prisma: PrismaClient,
	environmentId: string,
	month: string,
): Promise<number> {
	const { end } = monthWindow(month);
	// Filter must mirror packages/strategy-plan/sections/hero-metrics.ts
	// EXACTLY. If the two diverge, decideAutoRegen would either miss
	// stale plans (its computed "current" is lower than what the plan
	// generator would compute on regen) or thrash (higher). Wave 22.9
	// added "regressed" to hero-metrics.ts so this list matches it.
	const agg = await prisma.finding.aggregate({
		where: {
			environmentId,
			polarity: { in: ["negative", "neutral"] },
			status: { in: ["created", "confirmed", "regressed"] },
			statusChangedAt: { lt: end },
		},
		_sum: { impactMidpoint: true },
	});
	return Math.round(agg._sum.impactMidpoint ?? 0);
}

export interface AutoRegenDecision {
	shouldRegen: boolean;
	reason:
		| "no_plan"
		| "cooldown_active"
		| "divergence_below_threshold"
		| "material_divergence";
	staleExposureMid?: number;
	currentExposureMid?: number;
	divergenceRatio?: number;
}

export async function decideAutoRegen(
	prisma: PrismaClient,
	environmentId: string,
): Promise<AutoRegenDecision> {
	const month = ymNowUtc();
	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId, month } },
		select: { id: true, heroMetricsJson: true, lastRegenerated: true, status: true },
	});
	if (!plan) return { shouldRegen: false, reason: "no_plan" };
	// Skip while a regen is already in flight — the "generating" status
	// is set at the top of generateAndPersistPlan and cleared when it
	// finishes. Without this guard a burst of concurrent cycles could
	// each fire a regen against a half-written plan.
	if (plan.status === "generating") {
		return { shouldRegen: false, reason: "cooldown_active" };
	}
	const now = Date.now();
	if (now - plan.lastRegenerated.getTime() < AUTO_REGEN_COOLDOWN_MS) {
		return { shouldRegen: false, reason: "cooldown_active" };
	}

	const hero = plan.heroMetricsJson as { exposureMid?: number } | null;
	const staleExposureMid = Math.round(hero?.exposureMid ?? 0);
	const currentExposure = await currentExposureMid(prisma, environmentId, month);

	// Divergence normalized against the LARGER of the two so a
	// swing from 0 → 45k reads as 100% rather than infinity, and a
	// small absolute change against a big base doesn't over-trigger.
	const denom = Math.max(staleExposureMid, currentExposure, 1);
	const divergenceRatio = Math.abs(currentExposure - staleExposureMid) / denom;

	if (divergenceRatio < AUTO_REGEN_DIVERGENCE_THRESHOLD) {
		return {
			shouldRegen: false,
			reason: "divergence_below_threshold",
			staleExposureMid,
			currentExposureMid: currentExposure,
			divergenceRatio,
		};
	}

	return {
		shouldRegen: true,
		reason: "material_divergence",
		staleExposureMid,
		currentExposureMid: currentExposure,
		divergenceRatio,
	};
}

/**
 * Fire-and-forget hook for the cycle runner. Decides, and if the
 * decision is "regen", calls generateAndPersistPlan for the current
 * month. Errors are caught and logged — the caller (audit-runner)
 * must never see this throw, since a plan regen failure should not
 * blow up a completed cycle.
 */
export async function maybeAutoRegenPlan(
	prisma: PrismaClient,
	params: {
		environmentId: string;
		locale?: string;
		organizationId?: string | null;
	},
): Promise<{ triggered: boolean; decision: AutoRegenDecision; planId?: string; error?: string }> {
	const decision = await decideAutoRegen(prisma, params.environmentId);
	if (!decision.shouldRegen) {
		return { triggered: false, decision };
	}

	try {
		const { generateAndPersistPlan } = await import("./index");
		const month = ymNowUtc();
		const result = await generateAndPersistPlan(prisma, {
			environmentId: params.environmentId,
			month,
			locale: (params.locale as "pt-BR" | "en" | "es" | "de") ?? "pt-BR",
		});
		return { triggered: true, decision, planId: result.planId };
	} catch (err) {
		return {
			triggered: true,
			decision,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
