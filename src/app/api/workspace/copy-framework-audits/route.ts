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

		// Env resolution via the shared helper. This route ALREADY read
		// active_env correctly; migrating to resolveEnvId is for
		// consistency so no future edit reintroduces a divergent
		// pattern.
		const { cookies } = await import("next/headers");
		const cookieStore = await cookies();
		const activeEnv = cookieStore.get("active_env")?.value ?? null;
		const { resolveEnvId } = await import("@/libs/resolve-env");
		const envId = await resolveEnvId({ userId, activeEnv });
		if (!envId) {
			return NextResponse.json({ frameworks: {}, fallback: true });
		}
		const environment = { id: envId };

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
