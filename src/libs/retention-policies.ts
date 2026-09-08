// ──────────────────────────────────────────────
// Retention policy registry — the storage bound for the whole schema.
//
// **Why this file exists:** in Sept 2026 the production volume filled
// and the database crash-looped for eight days. The cause was not one
// runaway table but the absence of any place that answered "what stops
// this from growing forever?" Evidence, SurfaceRelation, AuditCycle and
// PageProbe had no prune at all; the behavioral prune that did exist
// logged nothing, so working and silently-failing looked identical.
//
// Every model in schema.prisma must appear in exactly one of the three
// lists below. `scripts/check-invariants.ts` enforces that, so adding a
// model without deciding what bounds it fails the build rather than
// quietly becoming the next outage.
//
// The bound this gives you is arithmetic, not a hope:
//
//     steady state = Σ (write rate × retention window)
//
// A model with a policy has a computable ceiling. A model without one
// has none — which is why ENTITY_BOUNDED demands a reason, and why
// "we'll add it later" is not one of the options.
//
// Caveat that matters operationally: DELETE marks tuples dead, it does
// not return pages to the OS. Retention holds a table at steady state,
// but recovering space after a backlog has already accumulated needs
// VACUUM FULL. The disk guard in instrumentation-node.ts says so when
// it fires.
// ──────────────────────────────────────────────

export interface RetentionPolicy {
	/** Prisma model name, exactly as written in schema.prisma. */
	model: string;
	/** Timestamp column rows are aged on. */
	field: string;
	/** Rows older than this are deleted. */
	days: number;
	/** Why this window — so the next person can change it deliberately. */
	reason: string;
	/**
	 * Column holding an R2 object key. When set, the retention pass
	 * deletes those objects before deleting the rows — otherwise pruning
	 * the table silently orphans the files it points at, trading a
	 * database leak for a bucket leak that nothing ever collects.
	 */
	r2KeyField?: string;
}

/**
 * Deleted on age. Ordered deliberately: AuditCycle runs first because it
 * cascades to Evidence, Finding and Action, so the passes below it have
 * far less to do.
 *
 * That cascade is only survivable because Evidence.auditCycleId is
 * indexed. Prisma does not index relation child columns on its own; the
 * missing index is what made cycle deletion take hours instead of
 * seconds, and it is why retention was never viable before. See the
 * @@index([auditCycleId]) note in schema.prisma.
 */
export const RETENTION_POLICIES: RetentionPolicy[] = [
	// ── Audit pipeline: the dominant writer ──
	{
		model: "AuditCycle",
		field: "createdAt",
		days: 90,
		reason:
			"Cycles are the spine of plan history, so they outlive the artifacts hanging off them. Cascades to Evidence, Finding and Action.",
	},
	{
		model: "AuditCyclePass",
		field: "createdAt",
		days: 90,
		reason:
			"~4.5 passes per cycle and no FK to AuditCycle, so it does not cascade. Matched to the cycle window.",
	},
	{
		model: "Evidence",
		field: "createdAt",
		days: 30,
		reason:
			"Raw page artifacts. Most rows cascade with their cycle; this catches the ones with a null auditCycleId, which the cascade cannot reach.",
	},
	{
		model: "SurfaceRelation",
		field: "lastSeenAt",
		days: 30,
		reason:
			"Current-state link graph. An edge unseen for 30 days is gone from the site. Aged on lastSeenAt, not createdAt, so a stable edge is never dropped.",
	},
	{
		model: "SurfaceScreenshot",
		field: "capturedAt",
		days: 30,
		reason:
			"~335 rows/day at peak cadence. The row is only a pointer; r2KeyField makes the pass reclaim the image too, so this does not turn a database leak into a bucket leak.",
		r2KeyField: "r2Key",
	},
	{
		model: "PageProbe",
		field: "observedAt",
		days: 30,
		reason: "One row per probe per URL on a 60s cron tick. Pure change-detection telemetry.",
	},
	{
		model: "CopyFrameworkAudit",
		field: "createdAt",
		days: 30,
		reason: "Per-cycle analysis output at ~2.2 KB/row; superseded by the next cycle.",
	},
	{
		model: "VersionedSnapshot",
		field: "createdAt",
		days: 90,
		reason: "Full cycle JSON dump. Duplicates CycleSnapshot; matched to the cycle window.",
	},

	// ── Caches: by definition reconstructible ──
	{
		model: "LlmResultCache",
		field: "createdAt",
		days: 30,
		reason: "Cache of LLM output per cycle. A miss costs one call, not correctness.",
	},
	{
		model: "ContentEnrichmentCache",
		field: "lastHitAt",
		days: 60,
		reason:
			"Content-hash keyed LLM cache. Aged on lastHitAt so a page that keeps hitting stays cached indefinitely.",
	},

	// ── Telemetry and operational logs ──
	{
		model: "PageView",
		field: "createdAt",
		days: 90,
		reason: "Marketing-site analytics. Aggregates outlive the rows.",
	},
	{
		model: "MarketingEvent",
		field: "createdAt",
		days: 180,
		reason: "Attribution needs a longer window than pageviews to cover slow conversions.",
	},
	{
		model: "ProductEvent",
		field: "createdAt",
		days: 90,
		reason: "In-app telemetry. Also pruned by product-telemetry.ts; this is the backstop.",
	},
	{
		model: "UserAction",
		field: "createdAt",
		days: 180,
		reason: "User activity trail for support context.",
	},
	{
		model: "NotificationLog",
		field: "createdAt",
		days: 90,
		reason: "Delivery log. Long enough to debug a bounce complaint.",
	},
	{
		model: "AuthEvent",
		field: "createdAt",
		days: 90,
		reason: "Login/security trail. 90 days covers incident review.",
	},
	{
		model: "PlatformError",
		field: "createdAt",
		days: 30,
		reason: "Error firehose. Only recent errors are actionable.",
	},
	{
		model: "WebhookEvent",
		field: "receivedAt",
		days: 30,
		reason: "Idempotency ledger. Only needs to outlive provider retry windows.",
	},
	{
		model: "AlertEvent",
		field: "createdAt",
		days: 90,
		reason: "Alert firing history.",
	},
	{
		model: "AnalysisJob",
		field: "createdAt",
		days: 30,
		reason: "Job records; terminal state is all that matters and only briefly.",
	},
	{
		model: "PlaybookRun",
		field: "startedAt",
		days: 90,
		reason: "Playbook execution history.",
	},
	{
		model: "ProspectScan",
		field: "createdAt",
		days: 90,
		reason: "Admin prospecting scans. Same staleness profile as audit cycles.",
	},
	{
		model: "McpPromptEvent",
		field: "createdAt",
		days: 90,
		reason: "MCP telemetry.",
	},
	{
		model: "McpSession",
		field: "startedAt",
		days: 90,
		reason: "MCP session records.",
	},
	{
		model: "McpSuggestionClick",
		field: "createdAt",
		days: 90,
		reason: "MCP interaction telemetry.",
	},
	{
		model: "OpportunityTracking",
		field: "updatedAt",
		days: 180,
		reason: "Opportunity lifecycle; longer window because the sales cycle is slow.",
	},

	// ── Auth ephemera ──
	{
		model: "Session",
		field: "expires",
		days: 0,
		reason: "NextAuth sessions carry their own expiry; anything past it is dead weight.",
	},
	{
		model: "VerificationToken",
		field: "expires",
		days: 0,
		reason: "Magic-link and verification tokens are single-use and short-lived.",
	},
	{
		model: "Invitation",
		field: "createdAt",
		days: 90,
		reason: "Unaccepted invitations go stale.",
	},

	// ── Conversations ──
	{
		model: "Conversation",
		field: "createdAt",
		days: 180,
		reason: "Chat history. Cascades to ConversationMessage.",
	},
	{
		model: "ConversationMessage",
		field: "createdAt",
		days: 180,
		reason: "Backstop for messages whose conversation row is already gone.",
	},
	{
		model: "InboundMessage",
		field: "createdAt",
		days: 180,
		reason: "Inbound email/webhook messages.",
	},

	// ── Long-window operational records ──
	{
		model: "Usage",
		field: "createdAt",
		days: 365,
		reason: "Feeds usage/billing reporting, so it needs a full year — but it is not permanent.",
	},
	{
		model: "TokenCostLedger",
		field: "createdAt",
		days: 365,
		reason: "LLM cost attribution. A year covers any billing dispute.",
	},
	{
		model: "BusinessProfileVersion",
		field: "createdAt",
		days: 365,
		reason: "Profile edit history.",
	},
	{
		model: "ChatFeedback",
		field: "createdAt",
		days: 365,
		reason: "Model-quality feedback; useful for a year of trend analysis.",
	},
];

export interface NullifyPolicy {
	model: string;
	/** Column blanked out (must be nullable). */
	column: string;
	field: string;
	days: number;
	reason: string;
}

/**
 * Rows we keep but whose fat column we blank. Used where the row itself
 * is still referenced but a denormalised payload on it is not.
 */
export const NULLIFY_POLICIES: NullifyPolicy[] = [
	{
		model: "AuditCycle",
		column: "projectionsCache",
		field: "completedAt",
		days: 30,
		reason:
			"142 MB of 157 MB on AuditCycle, averaging 39 KB/row. It is a read fallback for when the Action/Finding tables are empty — only relevant for recent cycles. The cycle row, its status and its timings all survive; only the duplicated projection blob is dropped.",
	},
];

/**
 * Pruned by dedicated logic elsewhere, because the rule is not "older
 * than N days". Listed here so the invariant can see them and so there
 * is one place that knows every model's bound.
 */
export const PRUNED_ELSEWHERE: Record<string, string> = {
	RawBehavioralEvent:
		"Per-plan window (30d starter/pro, 90d max) in the lead-cleanup cron — retention is a plan feature, not a constant.",
	AnonymousLead: "Deleted past its own expiresAt, except converted leads. lead-cleanup cron.",
	MiniAuditResult: "Deleted 7 days past expiresAt, with its R2 screenshot. lead-cleanup cron.",
	PageInventoryItem: "Orphan-marked then pruned by the audit-runner inventory pass.",
	CycleSnapshot: "Snapshot store keeps the last N per workspace/environment plus the baseline.",
	Finding: "Cascades from AuditCycle (onDelete: Cascade).",
	Action: "Cascades from AuditCycle (onDelete: Cascade).",
	PlanNextStep: "Cascades from MonthlyStrategyPlan; also replaced wholesale on regeneration.",
	PlanComment: "Cascades from MonthlyStrategyPlan.",
	PlanEdit: "Cascades from MonthlyStrategyPlan.",
	PlanVersion: "Cascades from MonthlyStrategyPlan.",
	TicketReply: "Cascades from SupportTicket.",
};

/**
 * Bounded by entity count, not by time — they grow with customers,
 * environments or pages, and stop growing when those stop growing.
 *
 * The reason string is the point of this list. "It's small" is not a
 * reason; RawBehavioralEvent was small once. The test is whether a
 * single environment running forever adds rows forever.
 */
export const ENTITY_BOUNDED: Record<string, string> = {
	// Identity and tenancy — one row per person/org/env.
	User: "One per person.",
	Account: "One per linked OAuth provider per user.",
	Organization: "One per customer.",
	Membership: "One per user per org.",
	OrgInvite: "One per pending invite; deleted on accept.",
	Environment: "One per monitored site.",
	Website: "One per domain per environment.",
	Surface: "A handful per environment.",
	ApiKey: "One per issued key.",
	NotificationPreference: "One per user.",
	SaasAccessConfig: "One per environment.",
	IntegrationConnection: "One per connected provider per environment.",
	OrgCredits: "One per organization.",
	PlatformConfig: "A fixed handful of platform-wide rows.",

	// Per-environment configuration and derived state, replaced not appended.
	BusinessProfile: "One per environment, updated in place.",
	FunnelModel: "One per environment, updated in place.",
	CompetitorDomain: "A bounded set per environment.",
	CustomMap: "One per user-created map.",
	DashboardLayout: "One per user per dashboard.",
	SavedView: "One per saved view.",
	SuppressionRule: "One per rule an operator creates.",
	AlertRule: "One per rule an operator creates.",
	DomainFingerprint: "One per environment, recomputed in place.",
	NetworkSurface: "Bounded by the environment's third-party surface, replaced per scan.",
	TrackingPixel: "One per configured pixel.",
	MonthlyStrategyPlan: "One per environment per month — grows ~12 rows/env/year at a few KB each.",

	// Marketing and experiments.
	ABTest: "One per experiment an operator defines.",
	HomepageVariant: "One per variant an operator defines.",
	Newsletter: "One per subscriber.",

	// Records kept deliberately: business, financial or legal value that
	// outweighs their (low) growth rate. Revisit only with that trade-off
	// in view, not for space.
	CreditTransaction: "Financial ledger — retained deliberately.",
	PixCharge: "Payment records — retained deliberately.",
	SupportTicket: "Customer support history — retained deliberately.",
	Feedback: "Customer feedback — retained deliberately.",
	CancelSurvey: "Churn reasons; low volume and high signal — retained deliberately.",
	AuditLog:
		"Hash-chained compliance log. Deleting from the middle breaks chain verification, so it is retained deliberately; volume is ~0.5 rows/day.",
};
