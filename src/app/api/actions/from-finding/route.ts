import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// POST /api/actions/from-finding
//
// Creates a UserAction from a verified finding — the terminal step
// of the chat Verify flow. Snapshots the finding's impact so that
// later cycles can compute attribution deltas.
//
// `finding_id` can be either:
//   - an engine id of the form `finding_<inference_key>` (what the
//     MCP projection layer emits and the chat UI carries around), or
//   - a Prisma Finding.id cuid (for internal callers that already
//     resolved to a specific cycle's row).
//
// Engine ids are resolved to the most recent Prisma Finding row for
// the caller's active environment + the embedded inference_key —
// that row carries the impact the baseline snapshot is taken from.
//
// Body:
//   {
//     finding_id: string (required)
//     title: string (required)
//     description?: string
//     remediation_steps?: string[]
//     estimated_effort_hours?: number
//     notes?: string
//     verified_via_conversation_id?: string
//   }
// ──────────────────────────────────────────────

const ENGINE_ID_PREFIX = "finding_";

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 5_000;
const MAX_NOTES = 5_000;

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!session?.user || !userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	let body: {
		finding_id?: string;
		title?: string;
		description?: string;
		remediation_steps?: string[];
		estimated_effort_hours?: number;
		notes?: string;
		verified_via_conversation_id?: string;
	};
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid body" }, { status: 400 });
	}

	const findingId = typeof body.finding_id === "string" ? body.finding_id.trim() : "";
	const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
	if (!findingId) return NextResponse.json({ message: "finding_id is required" }, { status: 400 });
	if (!title) return NextResponse.json({ message: "title is required" }, { status: 400 });

	const description = typeof body.description === "string"
		? body.description.slice(0, MAX_DESCRIPTION)
		: null;
	const notes = typeof body.notes === "string"
		? body.notes.slice(0, MAX_NOTES)
		: null;
	const remediationSteps = Array.isArray(body.remediation_steps)
		? JSON.stringify(body.remediation_steps.slice(0, 20).map((s) => String(s).slice(0, 500)))
		: null;
	const effortHours = typeof body.estimated_effort_hours === "number"
		&& Number.isFinite(body.estimated_effort_hours)
		&& body.estimated_effort_hours >= 0
		? body.estimated_effort_hours
		: null;
	const verifiedViaConversationId = typeof body.verified_via_conversation_id === "string"
		&& body.verified_via_conversation_id.trim().length > 0
		? body.verified_via_conversation_id.trim()
		: null;

	// Resolve the caller's active environment first so we can narrow
	// engine-id lookups (which need an env scope to disambiguate the
	// inference_key). Mirrors the pattern used by /api/cycles/latest
	// and /api/actions/user.
	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;
	let scopedEnv: { id: string; organizationId: string } | null = null;

	if (activeEnvId) {
		const env = await prisma.environment.findUnique({
			where: { id: activeEnvId },
			select: { id: true, organizationId: true },
		});
		if (env) {
			const m = await prisma.membership.findFirst({
				where: { userId, organizationId: env.organizationId },
				select: { id: true },
			});
			if (m) scopedEnv = env;
		}
	}
	if (!scopedEnv) {
		// Fallback: most-recent membership (same convention as
		// /api/cycles/latest). Picks an env from that org.
		const m = await prisma.membership.findFirst({
			where: { userId },
			orderBy: { createdAt: "desc" },
			select: { organizationId: true },
		});
		if (!m) {
			return NextResponse.json(
				{ message: "No environment available" },
				{ status: 403 },
			);
		}
		const env = await prisma.environment.findFirst({
			where: { organizationId: m.organizationId },
			select: { id: true, organizationId: true },
			orderBy: { createdAt: "asc" },
		});
		if (!env) {
			return NextResponse.json(
				{ message: "No environment available" },
				{ status: 403 },
			);
		}
		scopedEnv = env;
	}

	// Resolve the finding. Engine ids (`finding_<inference_key>`) come
	// from the MCP projection layer, which is what the chat UI carries
	// through. We look up the most recent Prisma Finding row for this
	// env + inferenceKey. Prisma cuids are looked up directly, then
	// cross-checked against scopedEnv to prevent cross-tenant access.
	let finding: {
		id: string;
		environmentId: string;
		cycleRef: string;
		impactMidpoint: number;
		impactMin: number;
		impactMax: number;
	} | null = null;

	if (findingId.startsWith(ENGINE_ID_PREFIX)) {
		const inferenceKey = findingId.slice(ENGINE_ID_PREFIX.length);
		if (!inferenceKey) {
			return NextResponse.json(
				{ message: "Empty inference_key in finding id" },
				{ status: 400 },
			);
		}
		finding = await prisma.finding.findFirst({
			where: { environmentId: scopedEnv.id, inferenceKey },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				environmentId: true,
				cycleRef: true,
				impactMidpoint: true,
				impactMin: true,
				impactMax: true,
			},
		});
	} else {
		finding = await prisma.finding.findUnique({
			where: { id: findingId },
			select: {
				id: true,
				environmentId: true,
				cycleRef: true,
				impactMidpoint: true,
				impactMin: true,
				impactMax: true,
			},
		});
		if (finding && finding.environmentId !== scopedEnv.id) {
			// Finding exists but belongs to another env — treat as not
			// found rather than leaking its existence via a different
			// error code.
			finding = null;
		}
	}

	if (!finding) {
		return NextResponse.json({ message: "Finding not found" }, { status: 404 });
	}

	const organizationId = scopedEnv.organizationId;

	// If a conversation ref is provided, sanity-check it belongs to the
	// same org so a stray ID from another tenant can't be stitched in.
	if (verifiedViaConversationId) {
		const conv = await prisma.conversation.findUnique({
			where: { id: verifiedViaConversationId },
			select: { organizationId: true },
		});
		if (!conv || conv.organizationId !== organizationId) {
			return NextResponse.json(
				{ message: "verified_via_conversation_id does not belong to this org" },
				{ status: 400 },
			);
		}
	}

	const action = await prisma.userAction.create({
		data: {
			organizationId,
			environmentId: finding.environmentId,
			findingId: finding.id,
			createdByUserId: userId,
			title,
			description,
			remediationSteps,
			estimatedEffortHours: effortHours,
			status: "pending",
			verifiedViaConversationId,
			verifiedAt: verifiedViaConversationId ? new Date() : null,
			notes,
			baselineImpactMidpoint: finding.impactMidpoint,
			baselineImpactMin: finding.impactMin,
			baselineImpactMax: finding.impactMax,
			baselineCycleRef: finding.cycleRef,
		},
		select: { id: true, status: true, createdAt: true },
	});

	return NextResponse.json(
		{
			id: action.id,
			status: action.status,
			createdAt: action.createdAt.toISOString(),
		},
		{ status: 201 },
	);
}
