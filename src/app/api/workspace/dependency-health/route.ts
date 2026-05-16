import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { getStatusPage } from "@/lib/status-pages";

// ──────────────────────────────────────────────
// Dependency health — GET /api/workspace/dependency-health
//
// For each technology detected on the customer's site whose vendor
// publishes a status page (curated mapping in src/lib/status-pages.ts),
// fetches the current Atlassian Statuspage v2 status JSON and returns
// the indicator + description.
//
// Server-side fetches happen in parallel with a 5s timeout per call;
// individual failures don't break the response. Results cached for
// 5 minutes per technology key (the status JSON doesn't change much
// faster than that and we want to be friendly to vendor endpoints).
//
// Wave 11.3e — Preflight workspace.
// ──────────────────────────────────────────────

interface StatusResult {
	technologyKey: string;
	displayName: string;
	publicUrl: string;
	indicator: "none" | "minor" | "major" | "critical" | "unknown";
	description: string;
	checkedAt: number;
}

// 5-minute in-memory cache shared across requests in the same node.
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: StatusResult; expiresAt: number }>();

function getCached(key: string): StatusResult | null {
	const hit = cache.get(key);
	if (!hit) return null;
	if (Date.now() > hit.expiresAt) {
		cache.delete(key);
		return null;
	}
	return hit.value;
}

function setCached(key: string, value: StatusResult): void {
	cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchStatusFor(entry: {
	technologyKey: string;
	displayName: string;
	apiUrl: string;
	publicUrl: string;
}): Promise<StatusResult> {
	const cached = getCached(entry.technologyKey);
	if (cached) return cached;

	const result: StatusResult = {
		technologyKey: entry.technologyKey,
		displayName: entry.displayName,
		publicUrl: entry.publicUrl,
		indicator: "unknown",
		description: "Status unavailable",
		checkedAt: Date.now(),
	};

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5_000);
		const res = await fetch(entry.apiUrl, {
			signal: controller.signal,
			// Status pages are public; no auth headers. UA helps some
			// providers serve us a cacheable response.
			headers: { "User-Agent": "Vestigio/1.0 (dependency-health)" },
		});
		clearTimeout(timeout);
		if (!res.ok) return result;
		const data = await res.json();
		// Atlassian Statuspage shape: { status: { indicator, description } }
		const ind = data?.status?.indicator;
		const desc = data?.status?.description;
		if (ind === "none" || ind === "minor" || ind === "major" || ind === "critical") {
			result.indicator = ind;
		}
		if (typeof desc === "string" && desc.length > 0 && desc.length < 200) {
			result.description = desc;
		}
	} catch {
		// Timeout, network error, or invalid JSON — keep result as "unknown".
	}

	setCached(entry.technologyKey, result);
	return result;
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
			include: { organization: { include: { environments: { take: 1 } } } },
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ services: [], coveredCount: 0, totalDetected: 0 });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) {
			return NextResponse.json({ services: [], coveredCount: 0, totalDetected: 0 });
		}

		// Read the same TechnologyDetected evidence as /api/workspace/tech-stack
		// (don't deduplicate via that endpoint to avoid an internal HTTP hop).
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

		const detectedKeys = new Set<string>();
		for (const row of rows) {
			try {
				const p = JSON.parse(row.payload);
				if (p && typeof p.technology_key === "string") {
					detectedKeys.add(p.technology_key);
				}
			} catch {
				// skip malformed
			}
		}

		// For each detected key with a known status page, fetch in parallel.
		const targets: Array<ReturnType<typeof getStatusPage>> = [];
		for (const key of detectedKeys) {
			const page = getStatusPage(key);
			if (page) targets.push(page);
		}

		const results = await Promise.allSettled(targets.map((t) => fetchStatusFor(t!)));
		const services = results
			.map((r) => (r.status === "fulfilled" ? r.value : null))
			.filter((s): s is StatusResult => s !== null);

		return NextResponse.json({
			services,
			coveredCount: services.length,
			totalDetected: detectedKeys.size,
		});
	},
	{ endpoint: "/api/workspace/dependency-health", method: "GET" },
);
