import { prisma } from "./prismaDb";

// ──────────────────────────────────────────────
// Product telemetry  (3.16)
//
// Self-hosted, fire-and-forget, privacy-respecting engagement tracking
// for the authenticated console. Tracks which pages users visit, which
// features they adopt, and computes a per-environment engagement score
// for churn risk detection.
//
// All writes are best-effort: a failure here must NOT disrupt the user's
// session. We log + swallow so a Postgres hiccup on the telemetry table
// doesn't break the console.
//
// Retention: 90 days, pruned by leader-elected cron.
// ──────────────────────────────────────────────

/** Allowlist of known product event types. Unknown events are silently dropped. */
export const PRODUCT_EVENT_TYPES = new Set<string>([
	"page_view",
	"feature_first_use",
	"workspace_drill",
	"finding_action",
	"drawer_open",
	"playbook_run",
]);

/** Feature name → User model field mapping for adoption timestamps. */
const FEATURE_FLAG_MAP: Record<string, string> = {
	chat: "firstChatAt",
	action: "firstActionAt",
	verify: "firstVerifyAt",
	workspace_drill: "firstWorkspaceDrillAt",
};

export interface ProductEventInput {
	userId: string;
	orgId: string;
	environmentId?: string;
	event: string;
	properties?: Record<string, unknown> | null;
	pathname: string;
	sessionId: string;
}

/**
 * Record a product engagement event. Fire-and-forget — never throws.
 * For `feature_first_use` events, also sets the adoption timestamp
 * on the User model (idempotent, only sets once).
 */
export function recordProductEvent(input: ProductEventInput): void {
	if (!PRODUCT_EVENT_TYPES.has(input.event)) return;

	prisma.productEvent
		.create({
			data: {
				userId: input.userId,
				orgId: input.orgId,
				environmentId: input.environmentId || null,
				event: input.event,
				properties: (input.properties as any) || undefined,
				pathname: input.pathname.slice(0, 500),
				sessionId: input.sessionId.slice(0, 100),
			},
		})
		.catch((err) => {
			console.warn(
				`[product-telemetry] failed to record ${input.event} for user=${input.userId}:`,
				err instanceof Error ? err.message : err,
			);
		});

	// Set feature adoption flag (idempotent — only fires on first use)
	if (input.event === "feature_first_use" && input.properties?.feature) {
		setFeatureAdoptionFlag(
			input.userId,
			String(input.properties.feature),
		);
	}
}

/**
 * Set the feature adoption timestamp on the User model. Uses updateMany
 * with a WHERE field IS NULL guard so the flag is only written once.
 * Matches the atomic conditional update pattern from env-activity.ts.
 */
function setFeatureAdoptionFlag(userId: string, feature: string): void {
	const field = FEATURE_FLAG_MAP[feature];
	if (!field) return;

	prisma.user
		.updateMany({
			where: { id: userId, [field]: null },
			data: { [field]: new Date() },
		})
		.catch((err) => {
			console.warn(
				`[product-telemetry] failed to set ${field} for user=${userId}:`,
				err instanceof Error ? err.message : err,
			);
		});
}

// ──────────────────────────────────────────────
// Engagement score computation (cron)
// ──────────────────────────────────────────────

export interface EngagementScoreResult {
	envsScored: number;
	avgScore: number;
}

/**
 * Compute and persist engagement scores for all activated environments.
 * Scores are 0-100, weighted by event types over the last 7 days.
 *
 * Weights:
 *   page_view:       0.10  (passive — just opening the app)
 *   workspace_drill:  0.15  (exploratory — drilling into workspaces)
 *   finding_action:   0.25  (active — acting on findings)
 *   drawer_open:      0.10  (exploratory — viewing details)
 *   feature_first_use: 0.10  (adoption — trying new features)
 *   playbook_run:      0.30  (high-value — running guided analysis)
 */
export async function computeEngagementScores(): Promise<EngagementScoreResult> {
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	// Get all activated environments with their org members
	const envs = await prisma.environment.findMany({
		where: { activated: true },
		select: {
			id: true,
			organization: {
				select: {
					memberships: { select: { userId: true } },
				},
			},
		},
	});

	if (envs.length === 0) return { envsScored: 0, avgScore: 0 };

	const EVENT_WEIGHTS: Record<string, number> = {
		page_view: 0.10,
		workspace_drill: 0.15,
		finding_action: 0.25,
		drawer_open: 0.10,
		feature_first_use: 0.10,
		playbook_run: 0.30,
	};

	// Max raw score per event type (caps to prevent one event type from dominating)
	const EVENT_CAPS: Record<string, number> = {
		page_view: 50,        // ~7 page views/day
		workspace_drill: 20,  // ~3/day
		finding_action: 15,   // ~2/day
		drawer_open: 30,      // ~4/day
		feature_first_use: 4, // one-time per feature
		playbook_run: 10,     // ~1-2/day
	};

	const rawScores: Array<{ envId: string; score: number }> = [];

	// Process in batches of 50 to avoid overwhelming the DB
	for (let i = 0; i < envs.length; i += 50) {
		const batch = envs.slice(i, i + 50);

		for (const env of batch) {
			const userIds = env.organization.memberships.map((m) => m.userId);
			if (userIds.length === 0) {
				rawScores.push({ envId: env.id, score: 0 });
				continue;
			}

			try {
				const counts = await prisma.productEvent.groupBy({
					by: ["event"],
					where: {
						userId: { in: userIds },
						createdAt: { gte: sevenDaysAgo },
					},
					_count: true,
				});

				let weightedSum = 0;
				for (const row of counts) {
					const weight = EVENT_WEIGHTS[row.event] ?? 0;
					const cap = EVENT_CAPS[row.event] ?? 10;
					const capped = Math.min(row._count, cap);
					weightedSum += capped * weight;
				}

				// Normalize to 0-100 (max possible = sum of all caps * weights)
				const maxPossible = Object.entries(EVENT_WEIGHTS).reduce(
					(sum, [evt, w]) => sum + (EVENT_CAPS[evt] ?? 10) * w,
					0,
				);
				const normalized = Math.round(
					Math.min(100, (weightedSum / maxPossible) * 100),
				);
				rawScores.push({ envId: env.id, score: normalized });
			} catch {
				rawScores.push({ envId: env.id, score: 0 });
			}
		}
	}

	// Batch-update scores
	let totalScore = 0;
	for (const { envId, score } of rawScores) {
		totalScore += score;
		try {
			await prisma.environment.update({
				where: { id: envId },
				data: { engagementScore: score },
			});
		} catch {
			// swallow — non-critical
		}
	}

	return {
		envsScored: rawScores.length,
		avgScore: rawScores.length > 0 ? totalScore / rawScores.length : 0,
	};
}

// ──────────────────────────────────────────────
// Pruning (cron)
// ──────────────────────────────────────────────

export interface PruneResult {
	count: number;
}

/**
 * Delete product events older than the retention window.
 * Uses the @@index([createdAt]) for efficient range scan.
 */
export async function pruneOldProductEvents(
	retentionDays: number = 90,
): Promise<PruneResult> {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	try {
		const result = await prisma.productEvent.deleteMany({
			where: { createdAt: { lt: cutoff } },
		});
		return { count: result.count };
	} catch (err) {
		console.warn(
			"[product-telemetry] prune failed:",
			err instanceof Error ? err.message : err,
		);
		return { count: 0 };
	}
}
