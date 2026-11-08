import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import { checkRateLimit } from "@/libs/limiter";
// The one definition of which Monday a date belongs to. Imported
// rather than copied: the browser sends whatever the date picker
// produced, and this is the normalisation that makes it joinable with
// the series.
import { mondayOf } from "../../../../packages/strategy-plan/sections/traffic-ground-truth";

// ──────────────────────────────────────────────
// The two cells the operator fills.
//
// "Eu preencho duas células por semana se vocês me devolverem a
// costura. Agendados e compareceram. O resto vocês medem."
//
// That is the entire contract, and the restraint is the feature. Every
// field added to this endpoint is a field that stops being filled, and
// a column filled three weeks and then abandoned is worse than an
// empty one because the stitch built on it looks continuous and is
// not.
//
// So: two integers, an optional money figure for the businesses that
// earn in money rather than appointments, and a free note nobody
// parses.
// ──────────────────────────────────────────────

/** A count the operator typed. Rejects nonsense without being clever
 *  about it: negatives are impossible, and the ceiling exists so a
 *  fat-fingered paste cannot distort a chart for a year. */
function count(v: unknown): number | null {
	if (v === null || v === undefined || v === "") return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
	return Math.round(n);
}

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	const orgCtx = await resolveOrgContext();
	if (!orgCtx.envId) return NextResponse.json({ weeks: [] });

	const { prisma } = await import("@/libs/prismaDb");
	const rows = await prisma.$queryRawUnsafe<
		{
			week: Date;
			booked: number | null;
			showed: number | null;
			revenueBrl: number | null;
			note: string | null;
		}[]
	>(
		`SELECT "week","booked","showed","revenueBrl","note"
		 FROM "TrafficGroundTruth" WHERE "envId" = $1 ORDER BY "week" DESC LIMIT 60`,
		orgCtx.envId,
	);
	return NextResponse.json({
		weeks: rows.map((r) => ({
			week: r.week.toISOString().slice(0, 10),
			booked: r.booked,
			showed: r.showed,
			revenueBrl: r.revenueBrl,
			note: r.note,
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

	const week = mondayOf(typeof body.week === "string" ? body.week : "");
	if (!week) return NextResponse.json({ message: "week is required" }, { status: 400 });

	const booked = count(body.booked);
	const showed = count(body.showed);
	const revenueBrl = count(body.revenueBrl);
	const note =
		typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

	if (booked === null && showed === null && revenueBrl === null && note === null) {
		// An empty submit is almost always a misclick, and writing it
		// would turn a week nobody filled into a week filled with
		// nothing, which the stitch cannot tell apart.
		return NextResponse.json({ message: "nothing to save" }, { status: 400 });
	}

	try {
		const { prisma } = await import("@/libs/prismaDb");
		// Re-entering a week corrects it. There is exactly one truth per
		// seven days and the operator is allowed to have remembered it
		// wrong the first time.
		await prisma.$executeRawUnsafe(
			`INSERT INTO "TrafficGroundTruth"
			 ("id","envId","week","booked","showed","revenueBrl","note","enteredBy","updatedAt")
			 VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,now())
			 ON CONFLICT ("envId","week") DO UPDATE SET
			   "booked" = EXCLUDED."booked",
			   "showed" = EXCLUDED."showed",
			   "revenueBrl" = EXCLUDED."revenueBrl",
			   "note" = EXCLUDED."note",
			   "updatedAt" = now()`,
			orgCtx.envId,
			week,
			booked,
			showed,
			revenueBrl,
			note,
			session.user.email ?? null,
		);
		return NextResponse.json({ ok: true, week: week.toISOString().slice(0, 10) });
	} catch (err) {
		console.error("[ground-truth]", err);
		return NextResponse.json({ message: "Failed to save" }, { status: 500 });
	}
}
