// ──────────────────────────────────────────────
// Strategy Plan generator — shared types
//
// Contract surface for the per-section sub-generators. The output
// shape mirrors src/components/strategy/types.ts (the UI contract)
// so the generator output can be persisted to MonthlyStrategyPlan
// columns AND rendered directly by StrategyPlanPanel without any
// adapter layer in between.
// ──────────────────────────────────────────────

import type { BuyerKind } from "./pack-to-buyer";
export type { BuyerKind } from "./pack-to-buyer";

export interface GenerateContext {
	environmentId: string;
	envDomain: string;
	month: string; // 'YYYY-MM'
	locale: "pt-BR" | "en" | "es" | "de";
	/** First-of-month UTC for the requested month. Sub-generators
	    derive their windows from here so callers can stub `now()` for
	    deterministic tests. */
	monthStart: Date;
	/** First-of-next-month UTC. */
	monthEnd: Date;
}

export interface HeroMetricsOutput {
	retainedMid: number;
	capturedMid: number;
	criticalCount: number;
	inProgressCount: number;
	retainedDeltaMoM: number;
	capturedDeltaMoM: number;
	criticalDeltaMoM: number;
	inProgressDeltaMoM: number;
	retainedSpark: number[];
	capturedSpark: number[];
	// Wave-22.6 review fix P3.1 — receipt fields. The hero tile is
	// the most exposed surface of the plan; without an underlying
	// range + count it reads as a black box. These let the
	// AggregateMethodologyPopover render the actual evidence
	// ("R$ 18-32k from 14 findings") instead of just descriptive text.
	retainedMin: number;
	retainedMax: number;
	retainedFindingCount: number;
	capturedMin: number;
	capturedMax: number;
	capturedFindingCount: number;
}

export interface BuyerSegmentOutput {
	buyer: BuyerKind;
	buyerLabel: string;
	count: number;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
	sampleFindingIds: string[];
	sampleFindingTitles: string[];
}

export interface MemoryWindowOutput {
	label: string;
	actionsResolved: number;
	capturedTotal: number;
	topCategories: string[];
	biggestWin?: {
		title: string;
		capturedAmount: number;
		resolvedAt: string;
	};
	monthlyValues: Array<{ month: string; value: number }>;
	benchmarkAvailability?: "available" | "available_in_4_months" | "unavailable";
}

export interface MemoryRollupsOutput {
	"1m": MemoryWindowOutput;
	"3m": MemoryWindowOutput;
	"6m": MemoryWindowOutput;
	"12m": MemoryWindowOutput;
}

export interface ValuePreviewMarkerOutput {
	label: string;
	unlocked: string[];
	eta?: string;
	icon: "check" | "pending" | "future";
}

export interface ValuePreviewOutput {
	currentMonth: ValuePreviewMarkerOutput;
	milestoneM3: ValuePreviewMarkerOutput;
	milestoneM6: ValuePreviewMarkerOutput;
	milestoneM12: ValuePreviewMarkerOutput;
}

export interface NextStepOutput {
	order: number;
	title: string;
	reasoning: string;
	procedureSteps: string[];
	researchRefs: Array<{ title: string; url?: string }>;
	estimatedEffort: string;
	suggestedOwner: string;
	linkedActionRefs: string[];
	/**
	 * Phase 2 — Finding.id values that drove this step's ranking.
	 * Persisted to PlanNextStep.linkedFindingRefsJson so the
	 * Plano → Findings drill-down can filter exactly to these
	 * findings instead of inferring through the action chain at
	 * read time.
	 */
	linkedFindingRefs: string[];
	combinedImpact: { min: number; max: number; midpoint: number };
}

export interface GenerationCost {
	llmCallsCount: number;
	llmCostCents: number;
}

export interface PlanGeneratorOutput {
	heroMetrics: HeroMetricsOutput;
	buyerSegments: BuyerSegmentOutput[];
	narrativeWhatHappened: string;
	valuePreview: ValuePreviewOutput;
	valuePreviewNarrative: string;
	memoryRollups: MemoryRollupsOutput;
	nextSteps: NextStepOutput[];
	cost: GenerationCost;
	cycleNumber: number;
}
