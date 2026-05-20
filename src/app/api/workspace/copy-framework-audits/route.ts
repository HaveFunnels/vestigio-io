import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Copy Framework Audits — batch read endpoint (Wave 19a)
//
// Pre-fix the Copy Framework Lens fanned out 10 parallel GET requests
// (one per framework) on mount. Even with the new DB-backed cache, 10
// parallel queries still cost ~10× the Prisma round-trip and clogged
// the connection pool when several team members opened the workspace
// at once.
//
// This endpoint serves the full per-page audit set in a single DB
// findMany() — cheap, indexed by (environmentId, locale) and bounded
// by the 10-frameworks ceiling. Frontend reads one response, hydrates
// state, and only falls back to the per-framework generation route
// for frameworks that don't have a row yet (cold cycle just landed,
// new framework added in code, etc.).
//
// Phase 2 (audit-runner pre-population on COLD cycle) makes the
// fallback path almost never fire in practice — users see instant
// data on every page open all week long.
// ──────────────────────────────────────────────

interface CriterionVerdict {
	id: string;
	status: "pass" | "warn" | "fail" | "not_evaluated";
	evidence: string;
	fix: string | null;
}

interface AuditResult {
	criteria: CriterionVerdict[];
	score_pct: number;
}

export const GET = withErrorTracking(
	async function GET(req: Request) {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		const userId = (session.user as { id?: string }).id;
		if (!userId) {
			return NextResponse.json({ message: "Invalid session" }, { status: 401 });
		}

		const url = new URL(req.url);
		const pageUrl = url.searchParams.get("pageUrl") || "";
		const locale = url.searchParams.get("locale") || "pt-BR";
		if (!pageUrl) {
			return NextResponse.json({ message: "pageUrl required" }, { status: 400 });
		}

		// Resolve env via active_env cookie (same priority as other workspace
		// endpoints). Falls back to the org's first env if no cookie set.
		const cookieStore = await import("next/headers").then((m) => m.cookies());
		const activeEnvId = cookieStore.get("active_env")?.value;

		const membership = await prisma.membership.findFirst({
			where: { userId },
			select: { organizationId: true },
			orderBy: { createdAt: "desc" },
		});
		if (!membership) {
			return NextResponse.json({ frameworks: {}, fallback: true });
		}

		let environment = activeEnvId
			? await prisma.environment.findFirst({
					where: { id: activeEnvId, organizationId: membership.organizationId },
					select: { id: true },
				})
			: null;
		if (!environment) {
			environment = await prisma.environment.findFirst({
				where: { organizationId: membership.organizationId },
				orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
				select: { id: true },
			});
		}
		if (!environment) {
			return NextResponse.json({ frameworks: {}, fallback: true });
		}

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: environment.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) {
			return NextResponse.json({ frameworks: {}, fallback: true });
		}

		// Single indexed read — gets every framework audit for this
		// (env, cycle, pageUrl, locale) bucket in one query.
		const rows = await prisma.copyFrameworkAudit.findMany({
			where: {
				environmentId: environment.id,
				cycleId: latestCycle.id,
				pageUrl,
				locale,
			},
			select: {
				frameworkId: true,
				criteria: true,
				scorePct: true,
			},
		});

		const frameworks: Record<string, AuditResult> = {};
		for (const r of rows) {
			frameworks[r.frameworkId] = {
				criteria: r.criteria as unknown as CriterionVerdict[],
				score_pct: r.scorePct,
			};
		}

		return NextResponse.json({
			frameworks,
			cycleId: latestCycle.id,
		});
	},
	{ endpoint: "/api/workspace/copy-framework-audits", method: "GET" },
);
