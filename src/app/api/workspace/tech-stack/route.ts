import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import type {
	DetectedTechnology,
	TechnologyCategory,
	TechnologyStackProjection,
} from "../../../../../packages/technology-registry/types";

// ──────────────────────────────────────────────
// Tech-stack API — GET /api/workspace/tech-stack
//
// Reads `TechnologyDetected` evidence rows (already produced by the
// audit cycle ingestion pipeline at `workers/ingestion/pipeline.ts`)
// for the user's environment latest cycle, then aggregates them into
// a `TechnologyStackProjection` for the frontend to render.
//
// We do NOT re-run detection here — detection runs at crawl time and
// the rows are persisted to Evidence. This endpoint is pure read +
// shape + dedup.
//
// Used by:
//  - 11.3b SpofMap widget (Preflight workspace)
//  - 11.3e Third-party dependency health (Preflight)
//  - 11.3a "10x" simulator (Preflight)
//  - 11.3c Budget forecast (Preflight)
// ──────────────────────────────────────────────

const ALL_CATEGORIES: TechnologyCategory[] = [
	"platform",
	"payment_provider",
	"analytics",
	"tag_manager",
	"support_widget",
	"consent_manager",
	"error_tracking",
	"ab_testing",
	"cdn",
	"email_marketing",
	"other",
];

function emptyProjection(): TechnologyStackProjection {
	return {
		technologies: [],
		by_category: ALL_CATEGORIES.reduce(
			(acc, c) => {
				acc[c] = [];
				return acc;
			},
			{} as Record<TechnologyCategory, DetectedTechnology[]>,
		),
		total_detected: 0,
		summary: {
			has_analytics: false,
			has_tag_manager: false,
			has_support_widget: false,
			has_consent_manager: false,
			has_error_tracking: false,
			payment_providers: [],
			platforms: [],
		},
	};
}

// Aggregate raw TechnologyDetected payloads into the projection.
// Same technology key can appear on multiple pages — merge them into a
// single DetectedTechnology with the union of detected_on URLs and the
// highest observed confidence.
function aggregate(payloads: Array<{
	technology_key: string;
	display_name: string;
	category: TechnologyCategory;
	confidence: number;
	detection_source: string;
	logo_key: string | null;
	detected_on: string[];
}>): TechnologyStackProjection {
	const byKey = new Map<string, DetectedTechnology>();
	for (const p of payloads) {
		const existing = byKey.get(p.technology_key);
		if (existing) {
			existing.confidence = Math.max(existing.confidence, p.confidence);
			const merged = new Set([...existing.detected_on, ...(p.detected_on || [])]);
			existing.detected_on = Array.from(merged);
		} else {
			byKey.set(p.technology_key, {
				key: p.technology_key,
				display_name: p.display_name,
				category: p.category,
				confidence: p.confidence,
				detection_source: p.detection_source,
				logo_key: p.logo_key,
				detected_on: [...(p.detected_on || [])],
			});
		}
	}
	const technologies = Array.from(byKey.values());

	const by_category = ALL_CATEGORIES.reduce(
		(acc, c) => {
			acc[c] = [];
			return acc;
		},
		{} as Record<TechnologyCategory, DetectedTechnology[]>,
	);
	for (const tech of technologies) {
		if (by_category[tech.category]) by_category[tech.category].push(tech);
	}

	return {
		technologies,
		by_category,
		total_detected: technologies.length,
		summary: {
			has_analytics: by_category.analytics.length > 0,
			has_tag_manager: by_category.tag_manager.length > 0,
			has_support_widget: by_category.support_widget.length > 0,
			has_consent_manager: by_category.consent_manager.length > 0,
			has_error_tracking: by_category.error_tracking.length > 0,
			payment_providers: by_category.payment_provider.map((t) => t.display_name),
			platforms: by_category.platform.map((t) => t.display_name),
		},
	};
}

export const GET = withErrorTracking(
	async function GET() {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		const userId = (session.user as { id?: string }).id;
		if (!userId) {
			return NextResponse.json({ message: "Invalid session" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: {
				organization: {
					include: { environments: { take: 1 } },
				},
			},
			orderBy: { createdAt: "desc" },
		});

		const env = membership?.organization?.environments?.[0];
		if (!env) {
			return NextResponse.json({ stack: emptyProjection(), cycleRef: null });
		}

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});

		if (!latestCycle) {
			return NextResponse.json({ stack: emptyProjection(), cycleRef: null });
		}

		// Evidence.cycleRef is the engine-side ref string `audit_cycle:<id>`
		// (see apps/audit-runner producers). Construct it here from the DB id.
		// Wave 18g — Evidence.environmentRef has the "environment:" prefix.
		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const envRef = `environment:${env.id}`;
		const rows = await prisma.evidence.findMany({
			where: {
				environmentRef: envRef,
				evidenceType: "technology_detected",
				cycleRef,
			},
			select: { payload: true },
			take: 500,
		});

		const payloads: Array<{
			technology_key: string;
			display_name: string;
			category: TechnologyCategory;
			confidence: number;
			detection_source: string;
			logo_key: string | null;
			detected_on: string[];
		}> = [];
		for (const row of rows) {
			try {
				const p = JSON.parse(row.payload);
				if (
					p &&
					typeof p.technology_key === "string" &&
					typeof p.display_name === "string" &&
					ALL_CATEGORIES.includes(p.category)
				) {
					payloads.push({
						technology_key: p.technology_key,
						display_name: p.display_name,
						category: p.category,
						confidence: typeof p.confidence === "number" ? p.confidence : 50,
						detection_source: typeof p.detection_source === "string" ? p.detection_source : "unknown",
						logo_key: typeof p.logo_key === "string" ? p.logo_key : null,
						detected_on: Array.isArray(p.detected_on) ? p.detected_on : [],
					});
				}
			} catch {
				// Skip malformed payload — never crash the workspace for a bad row.
			}
		}

		const stack = aggregate(payloads);
		return NextResponse.json({ stack, cycleRef });
	},
	{ endpoint: "/api/workspace/tech-stack", method: "GET" },
);
