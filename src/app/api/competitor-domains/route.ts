import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// Competitor Domains API — Wave 24
//
// GET    /api/competitor-domains?envId=<id>           → list active + inactive
// POST   /api/competitor-domains                      → add a competitor
// PATCH  /api/competitor-domains                      → toggle active / edit label/notes
// DELETE /api/competitor-domains?envId=<id>&id=<cid>  → remove a competitor
//
// Auth: owner-or-member of the env's org. Cap of 20 active rows
// enforced server-side (returns 409 when the cap is reached). The
// competitor-fetch enrichment pass takes the most-recently-added 10
// each cycle.
// ──────────────────────────────────────────────

const ACTIVE_CAP = 20;

// Apex-domain pattern: lowercase ASCII, no scheme, no path, no
// trailing slash, must have at least one dot, max 253 chars. We
// purposely don't accept www. — the operator pastes the apex.
const DOMAIN_REGEX = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;

const createSchema = z.object({
	envId: z.string().min(1),
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.refine((v) => DOMAIN_REGEX.test(v), {
			message:
				"Use apenas o domínio apex em minúsculas (ex.: exemplo.com.br), sem https:// nem barra final",
		}),
	label: z.string().trim().max(80).optional(),
	notes: z.string().trim().max(500).optional(),
});

const patchSchema = z.object({
	envId: z.string().min(1),
	id: z.string().min(1),
	active: z.boolean().optional(),
	label: z.string().trim().max(80).nullable().optional(),
	notes: z.string().trim().max(500).nullable().optional(),
});

async function assertEnvAccess(userId: string, envId: string) {
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			domain: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env)
		return { ok: false as const, status: 404, body: { message: "Environment not found" } };
	const owner = env.organization?.ownerId === userId;
	const member =
		env.organization?.memberships?.some((m) => m.userId === userId) ?? false;
	if (!owner && !member)
		return { ok: false as const, status: 403, body: { message: "Forbidden" } };
	return { ok: true as const, envDomain: env.domain };
}

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user)
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId)
		return NextResponse.json({ message: "envId is required" }, { status: 400 });

	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	const competitors = await prisma.competitorDomain.findMany({
		where: { environmentId: envId },
		orderBy: [{ active: "desc" }, { addedAt: "desc" }],
		select: {
			id: true,
			domain: true,
			label: true,
			notes: true,
			discoveryMethod: true,
			active: true,
			addedBy: true,
			addedAt: true,
		},
	});

	const activeCount = competitors.filter((c) => c.active).length;
	return NextResponse.json({
		competitors,
		active_count: activeCount,
		active_cap: ACTIVE_CAP,
	});
}

export async function POST(request: Request) {
	const user = await isAuthorized();
	if (!user)
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

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

	const { envId, domain, label, notes } = parsed.data;
	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	// Can't add yourself as a competitor.
	if (domain === access.envDomain.toLowerCase()) {
		return NextResponse.json(
			{ message: "Esse é o seu próprio domínio — adicione um competidor." },
			{ status: 400 },
		);
	}

	// Enforce the active cap inside a transaction — checking count and
	// then writing in separate queries lets two concurrent POSTs both
	// pass the guard at the same time and land one over the cap.
	try {
		const competitor = await prisma.$transaction(async (tx) => {
			const activeCount = await tx.competitorDomain.count({
				where: { environmentId: envId, active: true },
			});
			if (activeCount >= ACTIVE_CAP) {
				throw new Error("CAP_REACHED");
			}
			return tx.competitorDomain.create({
				data: {
					environmentId: envId,
					domain,
					label: label ?? null,
					notes: notes ?? null,
					discoveryMethod: "manual",
					active: true,
					addedBy: user.id,
				},
				select: {
					id: true,
					domain: true,
					label: true,
					notes: true,
					discoveryMethod: true,
					active: true,
					addedBy: true,
					addedAt: true,
				},
			});
		});
		return NextResponse.json({ competitor }, { status: 201 });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg === "CAP_REACHED") {
			return NextResponse.json(
				{
					message: `Limite de ${ACTIVE_CAP} competidores ativos atingido. Desative algum antes de adicionar mais.`,
				},
				{ status: 409 },
			);
		}
		if (msg.includes("Unique constraint")) {
			return NextResponse.json(
				{ message: "Esse competidor já está na sua lista." },
				{ status: 409 },
			);
		}
		console.error(`[api/competitor-domains POST] env=${envId}:`, err);
		return NextResponse.json(
			{ message: "Failed to create competitor" },
			{ status: 500 },
		);
	}
}

export async function PATCH(request: Request) {
	const user = await isAuthorized();
	if (!user)
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ message: "Validation failed", errors: parsed.error.issues },
			{ status: 400 },
		);
	}

	const { envId, id, active, label, notes } = parsed.data;
	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	try {
		const competitor = await prisma.$transaction(async (tx) => {
			const target = await tx.competitorDomain.findUnique({
				where: { id },
				select: { id: true, environmentId: true, active: true },
			});
			if (!target || target.environmentId !== envId) {
				throw new Error("NOT_FOUND");
			}
			// Re-activating? Enforce cap inside the same transaction so two
			// concurrent re-activations can't both pass the count check.
			if (active === true && !target.active) {
				const activeCount = await tx.competitorDomain.count({
					where: { environmentId: envId, active: true },
				});
				if (activeCount >= ACTIVE_CAP) {
					throw new Error("CAP_REACHED");
				}
			}
			const updateData: {
				active?: boolean;
				label?: string | null;
				notes?: string | null;
			} = {};
			if (active !== undefined) updateData.active = active;
			if (label !== undefined) updateData.label = label;
			if (notes !== undefined) updateData.notes = notes;
			return tx.competitorDomain.update({
				where: { id },
				data: updateData,
				select: {
					id: true,
					domain: true,
					label: true,
					notes: true,
					discoveryMethod: true,
					active: true,
					addedBy: true,
					addedAt: true,
				},
			});
		});
		return NextResponse.json({ competitor });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg === "NOT_FOUND") {
			return NextResponse.json({ message: "Competitor not found" }, { status: 404 });
		}
		if (msg === "CAP_REACHED") {
			return NextResponse.json(
				{ message: `Limite de ${ACTIVE_CAP} competidores ativos atingido.` },
				{ status: 409 },
			);
		}
		console.error(`[api/competitor-domains PATCH] env=${envId}:`, err);
		return NextResponse.json({ message: "Failed to update competitor" }, { status: 500 });
	}
}

export async function DELETE(request: Request) {
	const user = await isAuthorized();
	if (!user)
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	const id = url.searchParams.get("id");
	if (!envId || !id) {
		return NextResponse.json(
			{ message: "envId + id are required" },
			{ status: 400 },
		);
	}

	const access = await assertEnvAccess(user.id, envId);
	if (!access.ok) return NextResponse.json(access.body, { status: access.status });

	const target = await prisma.competitorDomain.findUnique({
		where: { id },
		select: { id: true, environmentId: true },
	});
	if (!target || target.environmentId !== envId) {
		return NextResponse.json({ message: "Competitor not found" }, { status: 404 });
	}

	await prisma.competitorDomain.delete({ where: { id } });
	return NextResponse.json({ ok: true });
}
