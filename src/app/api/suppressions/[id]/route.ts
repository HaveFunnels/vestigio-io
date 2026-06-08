import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { blockIfImpersonating } from "@/libs/impersonation-guard";

// ──────────────────────────────────────────────
// Suppression Rules — single-rule operations
//
// Routes:
//   PATCH  /api/suppressions/[id]  — update reason/expiresAt/policy/active
//   DELETE /api/suppressions/[id]  — hard delete (use PATCH isActive=false
//                                    for soft-disable preserving history)
//
// Access: caller must be a member of the org that owns the scoped env.
// Hard-delete is exposed because the schema carries no audit trail —
// "soft delete" via isActive=false is what customers want for review
// flows; hard DELETE is for cleanup.
// ──────────────────────────────────────────────

const VALID_REVIEW_POLICIES = new Set(["manual", "auto_expire", "permanent"]);

interface PatchBody {
	reason?: string;
	expiresAt?: string | null;
	reviewPolicy?: string;
	isActive?: boolean;
}

async function loadRuleWithOrgId(ruleId: string) {
	const rule = await prisma.suppressionRule.findUnique({
		where: { id: ruleId },
	});
	if (!rule) return null;

	// scopeRef formats: "environment:<envId>" or "workspace:<orgId>"
	let organizationId: string | null = null;
	if (rule.scopeRef.startsWith("environment:")) {
		const envId = rule.scopeRef.slice("environment:".length);
		const env = await prisma.environment.findUnique({
			where: { id: envId },
			select: { organizationId: true },
		});
		organizationId = env?.organizationId ?? null;
	} else if (rule.scopeRef.startsWith("workspace:")) {
		organizationId = rule.scopeRef.slice("workspace:".length);
	}

	return { rule, organizationId };
}

export const PATCH = withErrorTracking(
	async function PATCH(
		request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const impersonationBlock = await blockIfImpersonating();
		if (impersonationBlock) return impersonationBlock;

		const session = await getServerSession(authOptions);
		const userId = (session?.user as any)?.id;
		if (!session?.user || !userId) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const { id: ruleId } = await params;
		if (!ruleId) {
			return NextResponse.json({ message: "Missing rule id" }, { status: 400 });
		}

		const loaded = await loadRuleWithOrgId(ruleId);
		if (!loaded) {
			return NextResponse.json({ message: "Rule not found" }, { status: 404 });
		}
		if (!loaded.organizationId) {
			return NextResponse.json(
				{ message: "Rule scope cannot be resolved" },
				{ status: 422 },
			);
		}

		const membership = await prisma.membership.findFirst({
			where: { userId, organizationId: loaded.organizationId },
			select: { id: true },
		});
		if (!membership) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		let body: PatchBody;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ message: "Invalid body" }, { status: 400 });
		}

		const updates: Partial<{
			reason: string;
			expiresAt: Date | null;
			reviewPolicy: string;
			isActive: boolean;
		}> = {};

		if (typeof body.reason === "string") {
			if (body.reason.trim().length < 5) {
				return NextResponse.json(
					{ message: "reason must be at least 5 chars" },
					{ status: 400 },
				);
			}
			updates.reason = body.reason.trim();
		}

		if (body.reviewPolicy !== undefined) {
			if (!VALID_REVIEW_POLICIES.has(body.reviewPolicy)) {
				return NextResponse.json(
					{ message: `Invalid reviewPolicy: ${body.reviewPolicy}` },
					{ status: 400 },
				);
			}
			updates.reviewPolicy = body.reviewPolicy;
		}

		if (body.expiresAt !== undefined) {
			if (body.expiresAt === null) {
				updates.expiresAt = null;
			} else if (typeof body.expiresAt === "string") {
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
				updates.expiresAt = parsed;
			}
		}

		if (typeof body.isActive === "boolean") {
			updates.isActive = body.isActive;
		}

		// Cross-field validation: permanent + expiresAt is contradictory
		const finalPolicy = updates.reviewPolicy ?? loaded.rule.reviewPolicy;
		const finalExpires =
			updates.expiresAt !== undefined ? updates.expiresAt : loaded.rule.expiresAt;
		if (finalPolicy === "permanent" && finalExpires !== null) {
			return NextResponse.json(
				{ message: "permanent rules cannot have expiresAt" },
				{ status: 400 },
			);
		}

		if (Object.keys(updates).length === 0) {
			return NextResponse.json(
				{ message: "No valid fields to update" },
				{ status: 400 },
			);
		}

		const updated = await prisma.suppressionRule.update({
			where: { id: ruleId },
			data: updates,
		});

		return NextResponse.json({
			id: updated.id,
			scopeRef: updated.scopeRef,
			matchKey: updated.matchKey,
			reason: updated.reason,
			createdBy: updated.createdBy,
			expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
			reviewPolicy: updated.reviewPolicy,
			isActive: updated.isActive,
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString(),
		});
	},
	{ endpoint: "/api/suppressions/[id]", method: "PATCH" },
);

export const DELETE = withErrorTracking(
	async function DELETE(
		_request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const impersonationBlock = await blockIfImpersonating();
		if (impersonationBlock) return impersonationBlock;

		const session = await getServerSession(authOptions);
		const userId = (session?.user as any)?.id;
		if (!session?.user || !userId) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const { id: ruleId } = await params;
		if (!ruleId) {
			return NextResponse.json({ message: "Missing rule id" }, { status: 400 });
		}

		const loaded = await loadRuleWithOrgId(ruleId);
		if (!loaded) {
			return NextResponse.json({ message: "Rule not found" }, { status: 404 });
		}
		if (!loaded.organizationId) {
			return NextResponse.json(
				{ message: "Rule scope cannot be resolved" },
				{ status: 422 },
			);
		}

		const membership = await prisma.membership.findFirst({
			where: { userId, organizationId: loaded.organizationId },
			select: { id: true },
		});
		if (!membership) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		await prisma.suppressionRule.delete({ where: { id: ruleId } });

		return NextResponse.json({ ok: true, id: ruleId });
	},
	{ endpoint: "/api/suppressions/[id]", method: "DELETE" },
);
