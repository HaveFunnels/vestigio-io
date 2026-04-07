import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { normalizeDomain, validateLeadDomain } from "@/libs/lead-validation";

// ──────────────────────────────────────────────
// /api/admin/surface-scans
//
// GET  → list all prospect scans (with optional ?search filter)
// POST → create a new scan, dispatch the worker fire-and-forget
//
// Admin-only. Both routes go through the same admin role check.
// Domains are validated through the same blocklist used by /lp/audit
// (no FAANG, no IPs, no localhost) — admins can audit anything else
// even if the domain isn't owned by them.
// ──────────────────────────────────────────────

function isAdmin(session: any): boolean {
	return !!session?.user && (session.user as any).role === "ADMIN";
}

function generateShareToken(): string {
	// 32 hex chars = 128 bits of entropy. Not guessable, URL-safe.
	return randomBytes(16).toString("hex");
}

// ── GET ──
export const GET = withErrorTracking(
	async function GET(request: Request) {
		const session = await getServerSession(authOptions);
		if (!isAdmin(session)) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		const url = new URL(request.url);
		const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
		const status = url.searchParams.get("status") || "";

		const where: any = {};
		if (status && status !== "all") where.status = status;
		if (search) {
			where.OR = [
				{ domain: { contains: search, mode: "insensitive" } },
				{ label: { contains: search, mode: "insensitive" } },
				{ notes: { contains: search, mode: "insensitive" } },
			];
		}

		const scans = await prisma.prospectScan.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: 200,
			select: {
				id: true,
				shareToken: true,
				domain: true,
				label: true,
				status: true,
				pagesScanned: true,
				durationMs: true,
				createdAt: true,
				completedAt: true,
				createdByUserId: true,
				createdBy: { select: { name: true, email: true } },
			},
		});

		// Lightweight per-status counts for the page header
		const counts = await prisma.prospectScan.groupBy({
			by: ["status"],
			_count: { _all: true },
		});
		const summary = {
			total: counts.reduce((s, c) => s + c._count._all, 0),
			pending: counts.find((c) => c.status === "pending")?._count._all || 0,
			running: counts.find((c) => c.status === "running")?._count._all || 0,
			complete: counts.find((c) => c.status === "complete")?._count._all || 0,
			failed: counts.find((c) => c.status === "failed")?._count._all || 0,
		};

		return NextResponse.json({ data: scans, summary });
	},
	{ endpoint: "/api/admin/surface-scans", method: "GET" },
);

// ── POST ──
export const POST = withErrorTracking(
	async function POST(request: Request) {
		const session = await getServerSession(authOptions);
		if (!isAdmin(session)) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		let body: { domain?: string; label?: string; notes?: string };
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
		}

		const rawDomain = body.domain?.trim();
		if (!rawDomain) {
			return NextResponse.json({ message: "domain is required" }, { status: 400 });
		}

		const domainCheck = validateLeadDomain(rawDomain);
		if (!domainCheck.ok) {
			return NextResponse.json({ message: domainCheck.reason }, { status: 422 });
		}

		const normalized = normalizeDomain(rawDomain);
		const userId = (session!.user as any).id as string | undefined;

		const scan = await prisma.prospectScan.create({
			data: {
				shareToken: generateShareToken(),
				domain: normalized,
				label: body.label?.trim() || null,
				notes: body.notes?.trim() || null,
				status: "pending",
				createdByUserId: userId || null,
			},
		});

		// Fire-and-forget worker dispatch
		import("../../../../../apps/audit-runner/run-prospect-scan")
			.then((m) => m.runProspectScan(scan.id))
			.catch((err) => {
				console.error(`[admin-surface-scans] dispatch failed for ${scan.id}:`, err);
			});

		return NextResponse.json({
			id: scan.id,
			shareToken: scan.shareToken,
			status: scan.status,
		});
	},
	{ endpoint: "/api/admin/surface-scans", method: "POST" },
);
