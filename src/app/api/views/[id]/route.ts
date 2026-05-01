import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// PATCH /api/views/[id] — update a saved view
// DELETE /api/views/[id] — delete a saved view
//
// Rules:
//   - Cannot delete default views
//   - Cannot modify default views (except reorder)
//   - User must own the view
//   - Max 5 pinned views per user/environment
// ──────────────────────────────────────────────

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const view = await prisma.savedView.findUnique({ where: { id } });
	if (!view) {
		return NextResponse.json({ message: "View not found" }, { status: 404 });
	}
	if (view.userId !== userId) {
		return NextResponse.json({ message: "Access denied" }, { status: 403 });
	}

	let body: {
		name?: string;
		icon?: string;
		color?: string;
		filters?: Record<string, unknown>;
		groupBy?: string | null;
		sortBy?: string;
		layout?: string;
		order?: number;
		isShared?: boolean;
		isPinned?: boolean;
	};

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid body" }, { status: 400 });
	}

	// Block modification of default view content (allow reorder and pin only)
	if (view.isDefault) {
		const allowedKeys = ["order", "isPinned"];
		const bodyKeys = Object.keys(body);
		const hasDisallowed = bodyKeys.some((k) => !allowedKeys.includes(k));
		if (hasDisallowed) {
			return NextResponse.json(
				{ message: "Cannot modify default views" },
				{ status: 403 },
			);
		}
	}

	// Enforce max 5 pinned views
	if (body.isPinned === true && !view.isPinned) {
		const pinnedCount = await prisma.savedView.count({
			where: {
				userId,
				environmentId: view.environmentId,
				isPinned: true,
			},
		});
		if (pinnedCount >= 5) {
			return NextResponse.json(
				{ message: "Maximum 5 pinned views" },
				{ status: 400 },
			);
		}
	}

	const updateData: Record<string, unknown> = {};
	if (body.name !== undefined) updateData.name = body.name.trim();
	if (body.icon !== undefined) updateData.icon = body.icon;
	if (body.color !== undefined) updateData.color = body.color;
	if (body.filters !== undefined) updateData.filters = body.filters;
	if (body.groupBy !== undefined) updateData.groupBy = body.groupBy;
	if (body.sortBy !== undefined) updateData.sortBy = body.sortBy;
	if (body.layout !== undefined) updateData.layout = body.layout;
	if (body.order !== undefined) updateData.order = body.order;
	if (body.isShared !== undefined) updateData.isShared = body.isShared;
	if (body.isPinned !== undefined) updateData.isPinned = body.isPinned;

	const updated = await prisma.savedView.update({
		where: { id },
		data: updateData,
	});

	return NextResponse.json({ view: updated });
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const view = await prisma.savedView.findUnique({ where: { id } });
	if (!view) {
		return NextResponse.json({ message: "View not found" }, { status: 404 });
	}
	if (view.userId !== userId) {
		return NextResponse.json({ message: "Access denied" }, { status: 403 });
	}
	if (view.isDefault) {
		return NextResponse.json(
			{ message: "Cannot delete default views" },
			{ status: 403 },
		);
	}

	await prisma.savedView.delete({ where: { id } });

	return NextResponse.json({ success: true });
}
