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
	combinedImpact: { min: number; max: number; midpoint: number };
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
