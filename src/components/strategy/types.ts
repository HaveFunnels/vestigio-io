/*
 * Monthly Strategy Plan — UI-side type contract
 *
 * Plain TypeScript types decoupled from `@prisma/client` so the Step 3
 * visual mock can be built before any DB code is wired (the route
 * handler in Step 4 will adapt Prisma rows into this shape).
 *
 * When the generator (Step 4) writes plans, the adapter inside
 * /app/library/strategy/[month]/page.tsx is the only place that needs
 * to know about the JSON column shape; everything below stays stable.
 */

// 'failed' = infrastructure error during generation; cron retries it
// on the next pass. UI surfaces it as a recoverable state. Distinct
// from 'archived', which is an owner-intentional hide (RBAC-gated).
export type PlanStatus =
	| "generating"
	| "ready"
	| "editing"
	| "failed"
	| "archived";

export type NextStepStatus =
	| "todo"
	| "in_progress"
	| "in_review"
	| "done"
	| "blocked";

export type BuyerKind = "copy" | "eng" | "leadership";

export interface HeroMetric {
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
	// P3.1 — range + count receipts on the two currency tiles.
	// Optional so older serialized plans (no receipts) still render.
	retainedMin?: number;
	retainedMax?: number;
	retainedFindingCount?: number;
	capturedMin?: number;
	capturedMax?: number;
	capturedFindingCount?: number;
	// T1 — exposure receipts. UI flips the captured tile into exposure
	// mode ("R$ X em risco") when capturedMid === 0 and exposureMid > 0.
	exposureMid?: number;
	exposureMin?: number;
	exposureMax?: number;
	exposureFindingCount?: number;
}

export interface ContinuityStep {
	title: string;
	statusNow: "todo" | "in_progress" | "in_review" | "done" | "blocked";
	resolvedLinkedCount: number;
	totalLinkedCount: number;
	capturedImpact: number;
}

export interface ContinuitySection {
	previousMonthLabel: string | null;
	previousMonth: string | null;
	steps: ContinuityStep[];
	exposureDeltaSinceLastPlan: number;
	capturedSinceLastPlan: number;
}

export interface CrossCustomerPattern {
	pack: string;
	packLabel: string;
	businessModel: string;
	peerCount: number;
	peersWithPattern: number;
	peersWhoFixed: number;
	avgCapturedImpact: number | null;
}

// Wave 22.8 — Cross-feature sections

export interface CopyLensFramework {
	frameworkId: string;
	frameworkLabel: string;
	avgScorePct: number;
	audits: Array<{
		pageSlot: string;
		pageUrl: string;
		scorePct: number;
		topGap: {
			criterionId: string;
			criterionLabel: string;
			evidence: string | null;
		} | null;
	}>;
}

export interface CopyLensSection {
	cycleId: string | null;
	frameworks: CopyLensFramework[];
	totalAudits: number;
	weakestFramework: { id: string; label: string; avgScorePct: number } | null;
	strongestFramework: { id: string; label: string; avgScorePct: number } | null;
}

export interface CompetitorPeerSignal {
	severity: "low" | "medium" | "high";
	summary: string;
}

export interface CompetitorDeepSnapshot {
	pricingTiers: Array<{
		label: string | null;
		amount: number | null;
		currency: string | null;
		interval: "month" | "year" | "one_time" | null;
	}>;
	hasFreeTier: boolean;
	tierCount: number;
	pricingUrl: string | null;
	blogPostCount: number | null;
	blogLatestPostDate: string | null;
	blogUrl: string | null;
}

/** Mirror do CompetitorSignalKind do plan-side. UI usa pra chip color +
 *  label. Novos kinds (price/content trends) computados na plan-section
 *  por comparação cross-cycle de CompetitorDeepSnapshot. */
export type CompetitorSignalKind =
	| "copy_mirror"
	| "serp_encroachment"
	| "price_increase"
	| "dropped_free_tier"
	| "content_acceleration"
	| "content_silence";

export interface CompetitorEntry {
	domain: string;
	label: string | null;
	discoveryMethod: string;
	signals: Array<{
		kind: CompetitorSignalKind;
		severity: "low" | "medium" | "high";
		detail: string;
	}>;
	/** Wave 23 — pricing/blog snapshot. Opcional pra back-compat. */
	deepSnapshot?: CompetitorDeepSnapshot | null;
}

export interface CompetitorSection {
	cycleId: string | null;
	totalMonitored: number;
	totalActive: number;
	withSignalsCount: number;
	trustPostureLag: CompetitorPeerSignal | null;
	serpOverlap: CompetitorPeerSignal | null;
	entries: CompetitorEntry[];
}

export type ImpersonatorThreatType =
	| "typosquat"
	| "commercial_keyword"
	| "tld_variation"
	| "brand_interception"
	| "phishing_pattern";

export interface ImpersonatorMatchEntry {
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
	/** Wave 23 P1.1 — match exato dos bytes do favicon = clone visual.
	 *  Opcional pra back-compat com plans persistidos antes do field. */
	hasFaviconBytesMatch?: boolean;
}

export interface ImpersonatorsPeerSignal {
	inferenceKey: string;
	label: string;
	severity: "low" | "medium" | "high";
	summary: string;
}

export interface ImpersonatorsSection {
	cycleId: string | null;
	totalScannedEver: number;
	totalMatchesThisCycle: number;
	activeCount: number;
	highConfidenceCount: number;
	mediumConfidenceCount: number;
	lowConfidenceCount: number;
	withCommerceCount: number;
	withPaymentCount: number;
	withCredentialCount: number;
	findings: ImpersonatorsPeerSignal[];
	topEntries: ImpersonatorMatchEntry[];
}

export interface MapsTopHub {
	url: string;
	outboundCount: number;
}

export interface MapsRelationType {
	relationType: string;
	count: number;
}

export interface MapsSection {
	cycleId: string | null;
	relationsThisCycle: number;
	distinctHostCount: number;
	crossDomainCount: number;
	topHubs: MapsTopHub[];
	relationsByType: MapsRelationType[];
	customMapsCount: number;
	autoMapTypes: string[];
}

export interface BuyerSegment {
	buyer: BuyerKind;
	buyerLabel: string;
	count: number;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
	sampleFindingIds: string[];
	sampleFindingTitles: string[];
	/** Full id list backing the "X findings" badge → drawer drill.
	 *  Optional for backward compatibility with plans generated
	 *  before the field landed. */
	allFindingIds?: string[];
}

export interface ResearchRef {
	title: string;
	url?: string;
}

export interface NextStep {
	id: string;
	order: number;
	title: string;
	reasoning: string;
	procedureSteps: string[];
	researchRefs: ResearchRef[];
	estimatedEffort: string;
	suggestedOwner: string;
	linkedActionRefs: string[];
	/** Phase 2 — Finding.id values that drove this step's ranking.
	 *  Empty `[]` on pre-Phase-2 plans (the API echoes whatever the
	 *  DB has, no backfill). The drill-down UI hides the "Ver findings
	 *  do passo" affordance when this is empty. */
	linkedFindingRefs: string[];
	/** PV.9b - presigned URL of a captured screenshot of this step's surface
	 *  (the customer's actual page). Null when no screenshot matched / R2 off. */
	screenshotUrl?: string | null;
	/** Reta-final: server-resolved Action objects matching linkedActionRefs.
	 *  Lets the drawer render directly without cross-referencing MCP's
	 *  current-cycle snapshot (which misses older Action IDs the plan
	 *  references). Missing rows are silently dropped. */
	linkedActions?: Array<{
		id: string;
		title: string;
		description: string;
		severity: string;
		category: string;
		impactMin: number;
		impactMax: number;
		impactMidpoint: number;
	}>;
	combinedImpact: { min: number; max: number; midpoint: number };
	/** Reta-final: aggregated confidence tier across the linked findings.
	 *  Resolved server-side from Finding.confidence. UI surfaces a badge
	 *  only when "low" or "medium" — "high" is the default expectation
	 *  and doesn't need annotation. Null when no findings could be matched. */
	confidenceTier?: "low" | "medium" | "high" | null;
	/** Reta-final: how Vestigio will re-verify this step is fixed. Pulled
	 *  from REMEDIATION_CATALOG by the API based on the first matched
	 *  linkedFinding inferenceKey. Null when no catalog entry matched. */
	verification?: {
		notes: string;
		etaSeconds: number | null;
		strategy: string;
	} | null;
	/** Reta-final "Por página" lens: surfaces touched by this step's
	 *  linked findings, sorted by count desc. First entry is the primary
	 *  surface (where the step is grouped in the per-page view); rest are
	 *  rendered as "afeta também" badges. Empty when the step has no
	 *  surface-bound findings (renders in the "Cross-site" group). */
	affectedSurfaces?: Array<{ surface: string; findingCount: number }>;
	status: NextStepStatus;
	assigneeUserId: string | null;
	assigneeName: string | null;
	dueAt: Date | null;
	commentsCount: number;
}

export interface MemoryWindow {
	label: string;
	actionsResolved: number;
	capturedTotal: number;
	/** Sprint 3.4 — number of findings the engine DETECTED in this
	 *  window (irrespective of resolution). Surfaces Vestigio's work
	 *  even when the customer hasn't acted on anything yet, so the
	 *  Memory card never reads as a flat zero. Optional for backward
	 *  compatibility with plans generated before the column landed. */
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

export interface MemoryRollups {
	"1m": MemoryWindow;
	"3m": MemoryWindow;
	"6m": MemoryWindow;
	"12m": MemoryWindow;
}

export interface ValuePreviewMarker {
	label: string;
	unlocked: string[];
	eta?: string;
	icon: "check" | "pending" | "future";
}

export interface ValuePreview {
	currentMonth: ValuePreviewMarker;
	milestoneM3: ValuePreviewMarker;
	milestoneM6: ValuePreviewMarker;
	milestoneM12: ValuePreviewMarker;
}

/**
 * Wave 22.6 Step 9 — pending plan edit. MCP proposals + (eventually)
 * user-proposed edits both land here in 'pending' state and require
 * admin approval. UI renders an inline banner per section while the
 * row is unresolved.
 */
export interface PendingPlanEdit {
	id: string;
	sectionId: string;
	editorKind: "mcp" | "user";
	editorName: string;
	beforeText: string;
	afterText: string;
	reason: string | null;
	proposedAt: string;
}

/**
 * Wave 22.6 Step 9 — team-visible comment on a plan section. Notion-
 * style: no per-user privacy, anyone with read access sees them.
 * MCP-authored comments carry authorKind='mcp' and are styled with
 * Vestigio's avatar.
 */
export interface PlanComment {
	id: string;
	sectionId: string;
	authorKind: "user" | "mcp";
	authorName: string;
	body: string;
	createdAt: string;
	editedAt: string | null;
}

export interface StrategyPlan {
	id: string;
	environmentId: string;
	envDomain: string;
	month: string; // 'YYYY-MM'
	locale: "pt-BR" | "en" | "es" | "de";
	generatedAt: Date;
	lastRegenerated: Date;
	status: PlanStatus;
	cycleNumber: number;

	heroMetrics: HeroMetric;
	buyerSegments: BuyerSegment[];
	/** E1 — one-sentence monthly thesis. Optional for backward
	 *  compatibility with plans generated before E1 landed; UI hides
	 *  the thesis pull-quote when null/empty. */
	thesisOfMonth?: string | null;
	/** E3 — continuity payload from prior month. Null = first plan; UI
	 *  hides the section. */
	continuity?: ContinuitySection | null;
	/** E4 — peer pattern callout. Null = sample size below threshold;
	 *  UI hides the section. */
	crossCustomerPattern?: CrossCustomerPattern | null;
	/** Wave 22.8 — cross-feature sections. Each null = the underlying
	 *  data source had nothing to report this cycle; UI hides them. */
	copyLens?: CopyLensSection | null;
	competitor?: CompetitorSection | null;
	impersonators?: ImpersonatorsSection | null;
	maps?: MapsSection | null;
	/** Reta-final: pack distribution for the open findings backing this
	 *  plan. Used by the narrative to render a small horizontal stacked
	 *  bar instead of burying "tema dominante: copy 44%" in prose. Empty
	 *  array when no open findings exist (UI hides the visual). */
	packDistribution?: Array<{
		pack: string;
		label: string;
		count: number;
		sharePct: number;
	}>;
	/** #7 — Action Attribution Timeline. UserActions com status=done +
	 *  verifiedResolvedAt confirmado dentro da janela do plano. UI
	 *  renderiza "seu time recuperou R$ X porque Y fechou Z em DD/Nov".
	 *  Vazio quando nada foi recuperado no mês — UI hide a seção. */
	attributionTimeline?: Array<{
		id: string;
		title: string;
		ownerLabel: string;
		verifiedResolvedAt: string | null;
		doneAt: string | null;
		baselineImpactMidpoint: number;
	}>;
	/** Soma dos baselineImpactMidpoint do attributionTimeline. Bate com
	 *  o heroMetrics.capturedMid quando o plano persistido ainda não
	 *  regenerou — UI usa esse total como número primário. */
	attributionTotal?: number;
	/**
	 * Reta-final · visual proof: map of normalized surface path
	 * (e.g. "/", "/precos") → 1h-presigned R2 URL of the last captured
	 * screenshot for that path in this environment. Consumed by the
	 * PlanScreenshotContext + FindingCard so every finding whose
	 * `source_url` matches a captured surface renders alongside a
	 * screenshot of the actual page. Empty object when R2 unconfigured
	 * or the env has no captured surfaces yet — UI degrades to text.
	 */
	screenshotUrlByPath?: Record<string, string>;
	/**
	 * Reta-final · peer prevalence: map of inference_key → peer contrast
	 * line, resolved server-side from the Vestigio Index cohort matching
	 * the org's businessModel + locale. The FindingCard consumes this
	 * via <PlanPeerProvider> to render "X% of peers do this. You don't."
	 * beneath the root cause. Empty object when no cohort applies (e.g.
	 * lead_gen orgs — no dedicated cohort yet). See
	 * packages/signals/peer-line.ts for the whitelist + copy templates.
	 */
	peerLineByInferenceKey?: Record<
		string,
		{
			prevalence: number;
			cohortSampleSize: number;
			cohortPeriod: string;
			vertical: string;
			patternLabel: string;
			direction: string;
		}
	>;
	narrativeWhatHappened: string;
	valuePreviewNarrative: string;
	valuePreview: ValuePreview;
	memoryRollups: MemoryRollups;
	nextSteps: NextStep[];

	// Wave 22.6 Step 9 — collaboration state (optional so the Step 3
	// mock + showcase fallback still satisfy the type contract).
	pendingEdits?: PendingPlanEdit[];
	comments?: PlanComment[];
	viewerCanApprove?: boolean;
}
