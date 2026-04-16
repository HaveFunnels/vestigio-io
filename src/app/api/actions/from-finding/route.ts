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

	// Load the finding to resolve org/env + snapshot impact baseline.
	const finding = await prisma.finding.findUnique({
		where: { id: findingId },
		select: {
			id: true,
			environmentId: true,
			cycleRef: true,
			impactMidpoint: true,
			impactMin: true,
			impactMax: true,
			environment: { select: { organizationId: true } },
		},
	});
	if (!finding) {
		return NextResponse.json({ message: "Finding not found" }, { status: 404 });
	}

	const organizationId = finding.environment.organizationId;

	// Verify caller is a member of the finding's org.
	const membership = await prisma.membership.findFirst({
		where: { userId, organizationId },
		select: { id: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

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
