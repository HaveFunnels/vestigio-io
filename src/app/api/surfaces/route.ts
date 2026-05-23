import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// Surfaces API — Wave 22.5 Tier 3
//
// GET    /api/surfaces?envId=<id>          → list declared surfaces
// POST   /api/surfaces                     → create a new surface
// DELETE /api/surfaces?envId=<id>&id=<sid> → delete a surface
//
// Auth: owner-or-member of the env's org. Catch-all surface
// (urlPattern='*') cannot be deleted — it's the default fallback.
// ──────────────────────────────────────────────

const KINDS = ["public", "authenticated", "mixed"] as const;

const createSchema = z.object({
	envId: z.string().min(1),
	kind: z.enum(KINDS),
	urlPattern: z.string().min(1).max(200),
	label: z.string().min(1).max(80),
	authRequired: z.boolean().optional().default(false),
	displayOrder: z.number().int().min(0).max(999).optional().default(50),
});

async function assertEnvAccess(userId: string, envId: string) {
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) return { ok: false, status: 404, body: { message: "Environment not found" } };
	const owner = env.organization?.ownerId === userId;
	const member = env.organization?.memberships?.some((m) => m.userId === userId) ?? false;
	if (!owner && !member) return { ok: false, status: 403, body: { message: "Forbidden" } };
	return { ok: true as const };
}

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) return NextResponse.json({ message: "envId is required" }, { status: 400 });

	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	const surfaces = await prisma.surface.findMany({
		where: { environmentId: envId },
		orderBy: { displayOrder: "asc" },
		select: {
			id: true,
			kind: true,
			urlPattern: true,
			label: true,
			authRequired: true,
			displayOrder: true,
			createdAt: true,
		},
	});

	return NextResponse.json({ surfaces });
}

export async function POST(request: Request) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ message: "Validation failed", errors: parsed.error.issues },
			{ status: 400 },
		);
	}

	const { envId, kind, urlPattern, label, authRequired, displayOrder } = parsed.data;
	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	try {
		const surface = await prisma.surface.create({
			data: {
				environmentId: envId,
				kind,
				urlPattern,
				label,
				authRequired,
				displayOrder,
			},
			select: {
				id: true,
				kind: true,
				urlPattern: true,
				label: true,
				authRequired: true,
				displayOrder: true,
			},
		});
		return NextResponse.json({ surface });
	} catch (err: unknown) {
		// Unique constraint violation on (envId, urlPattern) — return 409.
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("Unique constraint")) {
			return NextResponse.json(
				{ message: "A surface with this URL pattern already exists for this environment" },
				{ status: 409 },
			);
		}
		console.error(`[api/surfaces POST] env=${envId}:`, err);
		return NextResponse.json({ message: "Failed to create surface" }, { status: 500 });
	}
}

export async function DELETE(request: Request) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	const id = url.searchParams.get("id");
	if (!envId || !id) {
		return NextResponse.json({ message: "envId + id are required" }, { status: 400 });
	}

	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	// Protect the catch-all surface — the engine relies on it as the
	// fallback classifier. Operators rename it ('Site público' → 'Loja
	// pública') but they can't delete it.
	const target = await prisma.surface.findUnique({
		where: { id },
		select: { id: true, urlPattern: true, environmentId: true },
	});
	if (!target || target.environmentId !== envId) {
		return NextResponse.json({ message: "Surface not found" }, { status: 404 });
	}
	if (target.urlPattern === "*") {
		return NextResponse.json(
			{ message: "Cannot delete the catch-all surface" },
			{ status: 400 },
		);
	}

	await prisma.surface.delete({ where: { id } });
	return NextResponse.json({ ok: true });
}
