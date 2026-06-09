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
	/** Engine translation maps for the owner's locale. Sub-generators
	    that synthesise human-facing strings (Next Step titles, etc.)
	    consult these instead of mechanical snake_case humanizing. When
	    absent — English-locale orgs or when the dictionary lookup
	    fails — sub-generators fall back to humanizing the key. */
	translations?: import("../projections/types").EngineTranslations;
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
	// T1 — exposure tile: monetary mass of currently OPEN loss findings.
	// UI uses this as the captured-tile fallback on month-1 envs where
	// captured == 0. Without it the hero opens with a row of zeros and
	// the customer can't tell why they're paying.
	exposureMid: number;
	exposureMin: number;
	exposureMax: number;
	exposureFindingCount: number;
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
	/** Full list of finding ids classified into this segment. Drives
	 *  the "X findings" badge → drawer drill-down on the plan UI.
	 *  Optional for backward compatibility with plans generated
	 *  before the field landed. */
	allFindingIds?: string[];
}

export interface MemoryWindowOutput {
	label: string;
	actionsResolved: number;
	capturedTotal: number;
	/** Sprint 3.4 — total findings detected by the engine in window
	 *  (irrespective of resolution). Drives the "Vestigio detectou"
	 *  primary metric so the card shows continuous work even when
	 *  customer hasn't acted yet. */
	findingsDetected?: number;
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
