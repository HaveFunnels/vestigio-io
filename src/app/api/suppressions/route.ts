import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { blockIfImpersonating } from "@/libs/impersonation-guard";

// ──────────────────────────────────────────────
// Suppression Rules — Wire 0
//
// CRUD for SuppressionRule rows. The audit-runner loads active rules
// scoped to the env (or its parent workspace) at recompute time and
// the engine reduces matching decisions' confidence (Phase 26 of
// packages/workspace/recompute.ts) — rules never hide findings, they
// reduce trust in them with rationale.
//
// Routes:
//   GET  /api/suppressions?environmentId=...  — list active rules
//   POST /api/suppressions                    — create rule
//
// matchKey matches against decision_key (e.g.
// "checkout_pricing_consistency") or inference refs (e.g.
// "inference:inf_xxx"). decision_key is the stable customer-facing
// choice; inference refs are transient and not recommended.
//
// Default reviewPolicy is "auto_expire" with 90-day expiry when no
// expiresAt is provided — forces customer to re-evaluate suppressions
// instead of letting them rot.
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

export const GET = withErrorTracking(
	async function GET(req: NextRequest) {
		const session = await getServerSession(authOptions);
		const userId = (session?.user as any)?.id;
		if (!session?.user || !userId) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const environmentId = req.nextUrl.searchParams.get("environmentId");
		if (!environmentId) {
			return NextResponse.json(
				{ message: "environmentId query param is required" },
				{ status: 400 },
			);
		}

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

		const membership = await prisma.membership.findFirst({
			where: { userId, organizationId: env.organizationId },
			select: { id: true },
		});
		if (!membership) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		const environmentRef = `environment:${environmentId}`;
		const workspaceRef = `workspace:${env.organizationId}`;

		const rules = await prisma.suppressionRule.findMany({
			where: {
				scopeRef: { in: [environmentRef, workspaceRef] },
			},
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({
			rules: rules.map((r) => ({
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
			})),
		});
	},
	{ endpoint: "/api/suppressions", method: "GET" },
);

export const POST = withErrorTracking(
	async function POST(request: Request) {
		const impersonationBlock = await blockIfImpersonating();
		if (impersonationBlock) return impersonationBlock;

		const session = await getServerSession(authOptions);
		const userId = (session?.user as any)?.id;
		if (!session?.user || !userId) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

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
			select: { organizationId: true },
		});
		if (!env) {
			return NextResponse.json(
				{ message: "Environment not found" },
				{ status: 404 },
			);
		}

		const membership = await prisma.membership.findFirst({
			where: { userId, organizationId: env.organizationId },
			select: { id: true },
		});
		if (!membership) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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

		return NextResponse.json(
			{
				id: rule.id,
				scopeRef: rule.scopeRef,
				matchKey: rule.matchKey,
				reason: rule.reason,
				createdBy: rule.createdBy,
				expiresAt: rule.expiresAt ? rule.expiresAt.toISOString() : null,
				reviewPolicy: rule.reviewPolicy,
				isActive: rule.isActive,
				createdAt: rule.createdAt.toISOString(),
				updatedAt: rule.updatedAt.toISOString(),
			},
			{ status: 201 },
		);
	},
	{ endpoint: "/api/suppressions", method: "POST" },
);
