import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// /api/admin/surface-scans/[id]
//
// GET    → full scan detail (used by polling on the admin page while
//          the scan is running, and by the row expander once complete)
// DELETE → permanently remove the scan
//
// Admin-only.
// ──────────────────────────────────────────────

function isAdmin(session: any): boolean {
	return !!session?.user && (session.user as any).role === "ADMIN";
}

export const GET = withErrorTracking(
	async function GET(
		_request: Request,
		context: { params: Promise<{ id: string }> },
	) {
		const session = await getServerSession(authOptions);
		if (!isAdmin(session)) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		const { id } = await context.params;
		const scan = await prisma.prospectScan.findUnique({
			where: { id },
			include: {
				createdBy: { select: { name: true, email: true } },
			},
		});

		if (!scan) {
			return NextResponse.json({ message: "Not found" }, { status: 404 });
		}

		// Parse JSON blobs server-side so the client gets typed objects
		return NextResponse.json({
			id: scan.id,
			shareToken: scan.shareToken,
			domain: scan.domain,
			label: scan.label,
			notes: scan.notes,
			status: scan.status,
			pagesScanned: scan.pagesScanned,
			durationMs: scan.durationMs,
			errorMsg: scan.errorMsg,
			createdAt: scan.createdAt.toISOString(),
			completedAt: scan.completedAt?.toISOString() || null,
			createdBy: scan.createdBy,
			preview: scan.preview ? JSON.parse(scan.preview) : null,
			visibleFindings: scan.visibleFindings ? JSON.parse(scan.visibleFindings) : [],
			blurredFindings: scan.blurredFindings ? JSON.parse(scan.blurredFindings) : [],
		});
	},
	{ endpoint: "/api/admin/surface-scans/[id]", method: "GET" },
);

export const DELETE = withErrorTracking(
	async function DELETE(
		_request: Request,
		context: { params: Promise<{ id: string }> },
	) {
		const session = await getServerSession(authOptions);
		if (!isAdmin(session)) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		const { id } = await context.params;
		try {
			await prisma.prospectScan.delete({ where: { id } });
			return NextResponse.json({ ok: true });
		} catch (err) {
			return NextResponse.json(
				{ message: err instanceof Error ? err.message : "Delete failed" },
				{ status: 500 },
			);
		}
	},
	{ endpoint: "/api/admin/surface-scans/[id]", method: "DELETE" },
);
