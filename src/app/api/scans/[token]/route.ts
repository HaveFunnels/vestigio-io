import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/scans/[token]
//
// Public endpoint — no auth required. Used by /scans/[token] page
// to fetch the prospect scan result for the share link. Token is
// 32 hex chars (128 bits of entropy) so it's not guessable.
//
// Returns scan data without internal notes or createdBy info (those
// are admin-only). Failed and pending scans return a sanitized
// "not ready yet" response so a leaked link doesn't expose admin
// state.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(
	_request: Request,
	context: { params: Promise<{ token: string }> },
) {
	const { token } = await context.params;

	if (!token || token.length !== 32) {
		return NextResponse.json({ message: "Invalid scan link" }, { status: 404 });
	}

	const scan = await prisma.prospectScan.findUnique({
		where: { shareToken: token },
		select: {
			id: true,
			domain: true,
			label: true,
			status: true,
			pagesScanned: true,
			durationMs: true,
			createdAt: true,
			completedAt: true,
			preview: true,
			visibleFindings: true,
			blurredFindings: true,
			// notes, errorMsg, createdBy intentionally excluded — admin only
		},
	});

	if (!scan) {
		return NextResponse.json({ message: "Scan not found" }, { status: 404 });
	}

	if (scan.status === "failed") {
		// Don't expose error details on the public link
		return NextResponse.json(
			{ message: "This audit could not be completed" },
			{ status: 410 },
		);
	}

	return NextResponse.json({
		domain: scan.domain,
		label: scan.label,
		status: scan.status,
		pagesScanned: scan.pagesScanned,
		durationMs: scan.durationMs,
		createdAt: scan.createdAt.toISOString(),
		completedAt: scan.completedAt?.toISOString() || null,
		preview: scan.preview ? JSON.parse(scan.preview) : null,
		visibleFindings: scan.visibleFindings ? JSON.parse(scan.visibleFindings) : [],
		blurredFindings: scan.blurredFindings ? JSON.parse(scan.blurredFindings) : [],
	});
}
