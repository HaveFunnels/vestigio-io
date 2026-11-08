import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import { checkRateLimit } from "@/libs/limiter";

// ──────────────────────────────────────────────
// What the operator changed, in their words.
//
// Asked for from the other end of the same problem: "o meu problema
// não é não saber a taxa, é não saber o que eu mexi. Trocamos a foto
// do produto em algum momento de setembro e ninguém anotou."
//
// A drift in the series is a question. This is where the candidate
// answers live, written by the people who caused them.
//
// Free text and an optional scope, on purpose. Forcing a taxonomy here
// is how a log stops being written, and a log nobody writes explains
// nothing.
// ──────────────────────────────────────────────

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	const orgCtx = await resolveOrgContext();
	if (!orgCtx.envId) return NextResponse.json({ changes: [] });

	const { prisma } = await import("@/libs/prismaDb");
	const rows = await prisma.$queryRawUnsafe<
		{ id: string; happenedOn: Date; what: string; scope: string | null; who: string | null }[]
	>(
		`SELECT "id","happenedOn","what","scope","who"
		 FROM "TrafficChange" WHERE "envId" = $1
		 ORDER BY "happenedOn" DESC LIMIT 100`,
		orgCtx.envId,
	);
	return NextResponse.json({
		changes: rows.map((r) => ({
			id: r.id,
			happenedOn: r.happenedOn.toISOString().slice(0, 10),
			what: r.what,
			scope: r.scope,
			who: r.who,
		})),
	});
}

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	// Generous on purpose. This is a person typing two numbers once a
	// week, so the limit exists to bound abuse, not to ration the one
	// interaction we actively want them to have.
	const limited = await checkRateLimit(60, 60_000);
	if (limited) return limited;

	const orgCtx = await resolveOrgContext();
	if (!orgCtx.envId) {
		return NextResponse.json({ message: "no environment" }, { status: 404 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return NextResponse.json({ message: "invalid body" }, { status: 400 });
	}

	const what = typeof body.what === "string" ? body.what.trim().slice(0, 300) : "";
	if (!what) return NextResponse.json({ message: "what is required" }, { status: 400 });

	// The day it happened as they remember it, defaulting to today.
	// createdAt is stored separately by the column default, because the
	// day someone writes a change down is almost never the day it
	// happened and conflating the two would make the log useless for
	// exactly the question it exists to answer.
	const raw = typeof body.happenedOn === "string" ? body.happenedOn.slice(0, 10) : "";
	const happenedOn = raw ? new Date(`${raw}T00:00:00.000Z`) : new Date();
	if (Number.isNaN(happenedOn.getTime())) {
		return NextResponse.json({ message: "invalid date" }, { status: 400 });
	}
	// A date in the future is a typo, not a plan.
	if (happenedOn.getTime() > Date.now() + 86400000) {
		return NextResponse.json({ message: "date is in the future" }, { status: 400 });
	}

	const scope =
		typeof body.scope === "string" && body.scope.trim()
			? body.scope.trim().slice(0, 200)
			: null;

	try {
		const { prisma } = await import("@/libs/prismaDb");
		await prisma.$executeRawUnsafe(
			`INSERT INTO "TrafficChange"
			 ("id","envId","happenedOn","what","scope","who")
			 VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5)`,
			orgCtx.envId,
			happenedOn,
			what,
			scope,
			session.user.email ?? null,
		);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[traffic-change]", err);
		return NextResponse.json({ message: "Failed to save" }, { status: 500 });
	}
}
