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
	/** True when no prior-month plan exists for this env. Narrative
	    uses this to flip the opening paragraph from accusatory
	    ("nada foi resolvido ainda") to onboarding ("esse é o seu
	    primeiro plano"). False when at least one earlier plan was
	    generated, regardless of its status. */
	isFirstPlan?: boolean;
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

export interface ContinuityStepOutput {
	title: string;
	statusNow: "todo" | "in_progress" | "in_review" | "done" | "blocked";
	resolvedLinkedCount: number;
	totalLinkedCount: number;
	capturedImpact: number;
}

export interface ContinuitySectionOutput {
	previousMonthLabel: string | null;
	previousMonth: string | null;
	steps: ContinuityStepOutput[];
	exposureDeltaSinceLastPlan: number;
	capturedSinceLastPlan: number;
}

export interface CrossCustomerPatternSectionOutput {
	pack: string;
	packLabel: string;
	businessModel: string;
	peerCount: number;
	peersWithPattern: number;
	peersWhoFixed: number;
	avgCapturedImpact: number | null;
}

// ──────────────────────────────────────────────
// Wave 22.8 — Cross-feature sections
// ──────────────────────────────────────────────

export interface CopyLensFrameworkOutput {
	frameworkId: string;
	frameworkLabel: string;
	avgScorePct: number;
	audits: Array<{
		pageSlot: string;
		pageUrl: string;
		scorePct: number;
		/** Worst-rated criterion in this page+framework pair, for the
		 *  "biggest gap" chip on the section card. */
		topGap: {
			criterionId: string;
			criterionLabel: string;
			evidence: string | null;
		} | null;
	}>;
}

export interface CopyLensSectionOutput {
	cycleId: string | null;
	frameworks: CopyLensFrameworkOutput[];
	totalAudits: number;
	weakestFramework: { id: string; label: string; avgScorePct: number } | null;
	strongestFramework: { id: string; label: string; avgScorePct: number } | null;
}

// Brand Impersonators — sourced from Evidence rows of type
// brand_impersonation_match (per-domain detail) and Finding rows from
// the brand_integrity pack (peer-set-wide rollups).
export type ImpersonatorThreatType =
	| "typosquat"
	| "commercial_keyword"
	| "tld_variation"
	| "brand_interception"
	| "phishing_pattern";

export interface ImpersonatorMatchEntryOutput {
	domain: string;
	threatType: ImpersonatorThreatType;
	confidence: "low" | "medium" | "high";
	confidenceScore: number;
	isActive: boolean;
	hasCommerceSignals: boolean;
	hasPaymentCapture: boolean;
	hasCredentialCapture: boolean;
	hasSensitivePath: boolean;
	commercialInterpretation: string;
	/**
	 * Wave 23 P1.1 — bytes-match exato do favicon contra o root. UI usa
	 * pra mostrar badge "cópia visual de favicon" (sinal mais forte de
	 * clone que match só de URL).
	 */
	hasFaviconBytesMatch: boolean;
}

export interface ImpersonatorsPeerSignalOutput {
	inferenceKey: string;
	label: string;
	severity: "low" | "medium" | "high";
	summary: string;
}

export interface ImpersonatorsSectionOutput {
	cycleId: string | null;
	/** Total brand_impersonation_match Evidence rows the env has
	 *  accumulated across history. Used as the eligibility check:
	 *  zero means the brand scan has never run and the section hides. */
	totalScannedEver: number;
	totalMatchesThisCycle: number;
	activeCount: number;
	highConfidenceCount: number;
	mediumConfidenceCount: number;
	lowConfidenceCount: number;
	withCommerceCount: number;
	withPaymentCount: number;
	withCredentialCount: number;
	findings: ImpersonatorsPeerSignalOutput[];
	/** Top N entries (active first, then by confidenceScore desc). */
	topEntries: ImpersonatorMatchEntryOutput[];
}

// Competitor Radar — sourced from CompetitorDomain (curated list) +
// the engine's competitive-lens pack Findings (copy_mirror_detected,
// trust_posture_lag, brand_serp_encroachment, serp_overlap_detected).
export interface CompetitorPeerSignalOutput {
	severity: "low" | "medium" | "high";
	/** First ~280 chars of the Finding.rootCause/reasoning, used as the
	 *  card summary. Engine writes well-formed PT-BR prose. */
	summary: string;
}

export interface CompetitorDeepSnapshotOutput {
	/** Wave 23 P0.2 — pricing tiers extraídos via regex (money pattern +
	 *  heading proximity). Vazio quando concorrente não tem pricing page
	 *  detectável OU quando o parser não bateu em nenhum tier. */
	pricingTiers: Array<{
		label: string | null;
		amount: number | null;
		currency: string | null;
		interval: "month" | "year" | "one_time" | null;
	}>;
	/** True quando "grátis", "free", "$0/mo" detectado entre os tiers. */
	hasFreeTier: boolean;
	/** Total de tiers distintos (count de pricingTiers). */
	tierCount: number;
	/** URL da pricing page detectada — null se nenhum path comum bateu. */
	pricingUrl: string | null;
	/** Wave 23 P1.2 — count aproximado de posts no blog index. Null = não
	 *  inferiu (sem <article> tags + sem padrão de slug de post). */
	blogPostCount: number | null;
	/** ISO da data do post mais recente (best-effort via <time datetime>
	 *  ou JSON-LD datePublished). */
	blogLatestPostDate: string | null;
	/** URL do blog index detectado — null se nenhum path comum bateu. */
	blogUrl: string | null;
}

export interface CompetitorEntryOutput {
	domain: string;
	label: string | null;
	/** 'manual' = pasted by owner; 'auto' = SERP-discovered (Wave 25). */
	discoveryMethod: string;
	signals: Array<{
		kind: "copy_mirror" | "serp_encroachment";
		severity: "low" | "medium" | "high";
		detail: string;
	}>;
	/**
	 * Wave 23 P0.2 + P1.2 — pricing + content velocity. Opcional pra
	 * back-compat (planos antigos não têm o campo).
	 */
	deepSnapshot?: CompetitorDeepSnapshotOutput | null;
}

export interface CompetitorSectionOutput {
	/** The cycle the per-competitor signals were drawn from. Null when
	 *  no signals exist this cycle (the section then renders the
	 *  monitoring-only mode). */
	cycleId: string | null;
	totalMonitored: number;
	totalActive: number;
	/** Number of entries with at least one signal this cycle. */
	withSignalsCount: number;
	/** Peer-set-wide signals not attached to one specific competitor. */
	trustPostureLag: CompetitorPeerSignalOutput | null;
	serpOverlap: CompetitorPeerSignalOutput | null;
	/** Per-competitor entries — active competitors only, sorted by
	 *  signal count desc then domain asc. */
	entries: CompetitorEntryOutput[];
}

// Maps — auto-generated maps are derived in runtime (no persisted
// entity), so the Plan section instead surfaces the SurfaceRelation
// graph captured this cycle plus a per-org CustomMap count. Read as:
// "Vestigio mapped N connections across M surfaces this cycle — open
// /app/maps to explore them."
export interface MapsTopHubOutput {
	url: string;
	outboundCount: number;
}

export interface MapsRelationTypeOutput {
	relationType: string;
	count: number;
}

export interface MapsSectionOutput {
	cycleId: string | null;
	/** Number of SurfaceRelation rows in the latest cycle. Zero when
	 *  no relations were captured (rare on a real env). */
	relationsThisCycle: number;
	/** Distinct hosts across source + target of the latest cycle. */
	distinctHostCount: number;
	/** Subset of relationsThisCycle whose isSameDomain is false. */
	crossDomainCount: number;
	/** Top URLs that produced the most outbound relations. Reads as
	 *  "your homepage links to 18 different places". */
	topHubs: MapsTopHubOutput[];
	/** Breakdown of relation types this cycle, sorted by count desc. */
	relationsByType: MapsRelationTypeOutput[];
	/** CustomMap rows the org has saved. Zero is normal for new orgs. */
	customMapsCount: number;
	/** Map types Vestigio always offers under /app/maps. Fixed list. */
	autoMapTypes: string[];
}

export interface PlanGeneratorOutput {
	heroMetrics: HeroMetricsOutput;
	buyerSegments: BuyerSegmentOutput[];
	/** E1 — one-sentence thesis at the top of the plan. */
	thesisOfMonth: string;
	narrativeWhatHappened: string;
	valuePreview: ValuePreviewOutput;
	valuePreviewNarrative: string;
	memoryRollups: MemoryRollupsOutput;
	nextSteps: NextStepOutput[];
	/** E3 — continuity vs. prior month. Null previousMonth => first plan
	 *  (no continuity to show); UI hides the section in that case. */
	continuity: ContinuitySectionOutput;
	/** E4 — peer pattern callout. Null when peer sample size below
	 *  threshold; UI hides the section. */
	crossCustomerPattern: CrossCustomerPatternSectionOutput | null;
	/** Wave 22.8 — cross-feature intelligence. Each is null when the
	 *  underlying data source has nothing to report this cycle; UI
	 *  hides those sections. */
	copyLens: CopyLensSectionOutput | null;
	competitor: CompetitorSectionOutput | null;
	impersonators: ImpersonatorsSectionOutput | null;
	maps: MapsSectionOutput | null;
	cost: GenerationCost;
	cycleNumber: number;
}
