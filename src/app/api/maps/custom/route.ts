import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import type { MapDefinition } from "../../../../../packages/maps";

export const runtime = "nodejs";

// GET /api/maps/custom — list custom maps for the authenticated user's org
export async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ maps: [] }, { status: 401 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ maps: [] });
	}

	const rows = await prisma.customMap.findMany({
		where: { organizationId: membership.organizationId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			name: true,
			description: true,
			mapDefinition: true,
			nodeCount: true,
			edgeCount: true,
			createdAt: true,
			creator: { select: { name: true } },
		},
		take: 50,
	});

	const maps: (MapDefinition & { dbId: string; creatorName: string | null; createdAt: Date })[] =
		rows.map((r) => {
			const def = JSON.parse(r.mapDefinition) as MapDefinition;
			return {
				...def,
				id: `custom_${r.id}`,
				dbId: r.id,
				creatorName: r.creator?.name || null,
				createdAt: r.createdAt,
			};
		});

	return NextResponse.json({ maps });
}

// POST /api/maps/custom — create a custom map (called by MCP or direct API)
export async function POST(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 403 });
	}

	const body = await request.json();
	const { name, description, mapDefinition, prompt } = body as {
		name?: string;
		description?: string;
		mapDefinition?: MapDefinition;
		prompt?: string;
	};

	if (!name || !mapDefinition || !mapDefinition.nodes) {
		return NextResponse.json(
			{ message: "name and mapDefinition required" },
			{ status: 400 },
		);
	}

	const row = await prisma.customMap.create({
		data: {
			organizationId: membership.organizationId,
			creatorUserId: user.id,
			name: name.slice(0, 200),
			description: description?.slice(0, 2000) || null,
			mapDefinition: JSON.stringify(mapDefinition),
			nodeCount: mapDefinition.nodes.length,
			edgeCount: mapDefinition.edges.length,
			prompt: prompt?.slice(0, 2000) || null,
		},
	});

	return NextResponse.json({
		id: row.id,
		mapId: `custom_${row.id}`,
		url: `/app/maps/custom_${row.id}`,
	});
}
