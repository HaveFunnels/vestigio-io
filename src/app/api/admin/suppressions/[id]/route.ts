import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { requireAdmin } from "@/libs/require-admin";

// ──────────────────────────────────────────────
// Suppression Rules — single-rule ops (admin-only)
//
// Routes:
//   PATCH  /api/admin/suppressions/[id]  update reason/expiresAt/policy/isActive
//   DELETE /api/admin/suppressions/[id]  hard delete (PATCH isActive=false for soft)
//
// See sibling route file for the operational rationale of why this is
// admin-internal and not customer-facing.
// ──────────────────────────────────────────────

const VALID_REVIEW_POLICIES = new Set(["manual", "auto_expire", "permanent"]);

interface PatchBody {
	reason?: string;
	expiresAt?: string | null;
	reviewPolicy?: string;
	isActive?: boolean;
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

export const PATCH = withErrorTracking(
	async function PATCH(
		request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;

		const { id: ruleId } = await params;
		if (!ruleId) {
			return NextResponse.json({ message: "Missing rule id" }, { status: 400 });
		}

		const existing = await prisma.suppressionRule.findUnique({
			where: { id: ruleId },
		});
		if (!existing) {
			return NextResponse.json({ message: "Rule not found" }, { status: 404 });
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

		const finalPolicy = updates.reviewPolicy ?? existing.reviewPolicy;
		const finalExpires =
			updates.expiresAt !== undefined ? updates.expiresAt : existing.expiresAt;
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

		return NextResponse.json(serializeRule(updated));
	},
	{ endpoint: "/api/admin/suppressions/[id]", method: "PATCH" },
);

export const DELETE = withErrorTracking(
	async function DELETE(
		_request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;

		const { id: ruleId } = await params;
		if (!ruleId) {
			return NextResponse.json({ message: "Missing rule id" }, { status: 400 });
		}

		const existing = await prisma.suppressionRule.findUnique({
			where: { id: ruleId },
			select: { id: true },
		});
		if (!existing) {
			return NextResponse.json({ message: "Rule not found" }, { status: 404 });
		}

		await prisma.suppressionRule.delete({ where: { id: ruleId } });

		return NextResponse.json({ ok: true, id: ruleId });
	},
	{ endpoint: "/api/admin/suppressions/[id]", method: "DELETE" },
);
