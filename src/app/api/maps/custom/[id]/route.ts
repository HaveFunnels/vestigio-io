import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import type { MapDefinition } from "../../../../../../packages/maps";

export const runtime = "nodejs";

// GET /api/maps/custom/:id — fetch a single custom map
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 403 });
	}

	const row = await prisma.customMap.findFirst({
		where: { id, organizationId: membership.organizationId },
	});
	if (!row) {
		return NextResponse.json({ message: "Not found" }, { status: 404 });
	}

	const mapDef = JSON.parse(row.mapDefinition) as MapDefinition;
	return NextResponse.json({
		map: { ...mapDef, id: `custom_${row.id}` },
	});
}

// DELETE /api/maps/custom/:id — delete a custom map (org-scoped)
export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 403 });
	}

	const deleted = await prisma.customMap.deleteMany({
		where: { id, organizationId: membership.organizationId },
	});

	return NextResponse.json({ deleted: deleted.count });
}
