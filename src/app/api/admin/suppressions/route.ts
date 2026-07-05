import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { requireAdmin } from "@/libs/require-admin";

// ──────────────────────────────────────────────
// Suppression Rules — Vestigio-internal admin tool (NOT customer-facing)
//
// The Phase 26 suppression pipeline (packages/workspace/recompute.ts:1013-1044)
// reduces confidence of matching decisions when an active rule's matchKey
// hits — never hides findings. The audit-runner loads rules at recompute
// time (apps/audit-runner/run-cycle.ts).
//
// Why admin-only:
// - Customers shouldn't be deciding what is a "false positive" — that
//   undermines the value prop (Vestigio finds revenue protection issues
//   FOR the customer). Pushing the decision onto them induces vanity
//   filtering (suppressing real issues to clean dashboards).
// - Each suppression is a SIGNAL that a detector needs tuning. The
//   right loop is: Vestigio team creates rule per-customer for a clear
//   false positive → opens ticket to fix detector at source → removes
//   rule once detector improves. Customer never sees the mechanism.
//
// Routes:
//   GET  /api/admin/suppressions?organizationId=...      list rules across all envs of org
//   GET  /api/admin/suppressions?environmentId=...       list rules for one env (+ its workspace)
//   POST /api/admin/suppressions                         create rule
//
// matchKey matches against decision_key (e.g.
// "checkout_pricing_consistency") or inference refs (e.g.
// "inference:inf_xxx"). decision_key is the stable choice.
// ──────────────────────────────────────────────

const VALID_REVIEW_POLICIES = new Set(["manual", "auto_expire", "permanent"]);
const DEFAULT_AUTO_EXPIRE_DAYS = 90;

interface CreateBody {
	environmentId?: string;
	matchKey?: string;
	reason?: string;
	expiresAt?: string | null;
	reviewPolicy?: string;
}

function serializeRule(r: {
	id: string;
	scopeRef: string;
	matchKey: string;
	reason: string;
	createdBy: string;
	expiresAt: Date | null;
	reviewPolicy: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		id: r.id,
		scopeRef: r.scopeRef,
		scopeKind: r.scopeRef.startsWith("workspace:") ? "workspace" : "environment",
		matchKey: r.matchKey,
		reason: r.reason,
		createdBy: r.createdBy,
		expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
		reviewPolicy: r.reviewPolicy,
		isActive: r.isActive,
		createdAt: r.createdAt.toISOString(),
		updatedAt: r.updatedAt.toISOString(),
	};
}

export const GET = withErrorTracking(
	async function GET(req: NextRequest) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;

		const organizationId = req.nextUrl.searchParams.get("organizationId");
		const environmentId = req.nextUrl.searchParams.get("environmentId");

		if (!organizationId && !environmentId) {
			return NextResponse.json(
				{ message: "organizationId or environmentId query param is required" },
				{ status: 400 },
			);
		}

		const scopeRefs: string[] = [];

		if (organizationId) {
			scopeRefs.push(`workspace:${organizationId}`);
			const envs = await prisma.environment.findMany({
				where: { organizationId },
				select: { id: true },
			});
			for (const e of envs) scopeRefs.push(`environment:${e.id}`);
		}

		if (environmentId) {
			const env = await prisma.environment.findUnique({
				where: { id: environmentId },
				select: { organizationId: true },
			});
			if (!env) {
				return NextResponse.json(
					{ message: "Environment not found" },
					{ status: 404 },
				);
			}
			const wsRef = `workspace:${env.organizationId}`;
			const envRef = `environment:${environmentId}`;
			if (!scopeRefs.includes(wsRef)) scopeRefs.push(wsRef);
			if (!scopeRefs.includes(envRef)) scopeRefs.push(envRef);
		}

		if (scopeRefs.length === 0) {
			return NextResponse.json({ rules: [] });
		}

		const rules = await prisma.suppressionRule.findMany({
			where: { scopeRef: { in: scopeRefs } },
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({ rules: rules.map(serializeRule) });
	},
	{ endpoint: "/api/admin/suppressions", method: "GET" },
);

export const POST = withErrorTracking(
	async function POST(request: Request) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;
		const userId = gate.admin.userId;

		let body: CreateBody;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ message: "Invalid body" }, { status: 400 });
		}

		const { environmentId, matchKey, reason } = body;

		if (!environmentId || typeof environmentId !== "string") {
			return NextResponse.json(
				{ message: "environmentId is required" },
				{ status: 400 },
			);
		}
		if (!matchKey || typeof matchKey !== "string" || matchKey.length === 0) {
			return NextResponse.json(
				{ message: "matchKey is required" },
				{ status: 400 },
			);
		}
		if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
			return NextResponse.json(
				{ message: "reason is required (min 5 chars)" },
				{ status: 400 },
			);
		}

		const reviewPolicy =
			body.reviewPolicy && VALID_REVIEW_POLICIES.has(body.reviewPolicy)
				? body.reviewPolicy
				: "auto_expire";

		const env = await prisma.environment.findUnique({
			where: { id: environmentId },
			select: { id: true },
		});
		if (!env) {
			return NextResponse.json(
				{ message: "Environment not found" },
				{ status: 404 },
			);
		}

		// Resolve expiresAt:
		//   - explicit ISO string: parse and validate (future date)
		//   - explicit null: keep null (only valid for permanent)
		//   - omitted + auto_expire: default 90 days from now
		//   - omitted + manual/permanent: null
		let expiresAt: Date | null = null;
		if (typeof body.expiresAt === "string") {
			const parsed = new Date(body.expiresAt);
			if (isNaN(parsed.getTime())) {
				return NextResponse.json(
					{ message: "expiresAt must be a valid ISO date" },
					{ status: 400 },
				);
			}
			if (parsed.getTime() <= Date.now()) {
				return NextResponse.json(
					{ message: "expiresAt must be in the future" },
					{ status: 400 },
				);
			}
			expiresAt = parsed;
		} else if (body.expiresAt === null) {
			expiresAt = null;
		} else if (reviewPolicy === "auto_expire") {
			expiresAt = new Date(Date.now() + DEFAULT_AUTO_EXPIRE_DAYS * 86_400_000);
		}

		if (reviewPolicy === "permanent" && expiresAt !== null) {
			return NextResponse.json(
				{ message: "permanent rules cannot have expiresAt" },
				{ status: 400 },
			);
		}

		const rule = await prisma.suppressionRule.create({
			data: {
				scopeRef: `environment:${environmentId}`,
				matchKey,
				reason: reason.trim(),
				createdBy: userId,
				expiresAt,
				reviewPolicy,
				isActive: true,
			},
		});

		return NextResponse.json(serializeRule(rule), { status: 201 });
	},
	{ endpoint: "/api/admin/suppressions", method: "POST" },
);
