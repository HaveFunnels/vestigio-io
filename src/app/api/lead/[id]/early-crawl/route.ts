import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { verifyFormToken } from "@/libs/lead-defense";
import type { CrawlProgress } from "@/types/crawl-progress";

// ──────────────────────────────────────────────
// POST /api/lead/[id]/early-crawl
//
// Fires the early-crawl worker fire-and-forget after step 1 of the
// /audit form (domain submitted). Pre-warms the audit so the terminal
// run-audit can skip the homepage httpFetch — net saving 1-4s.
//
// Auth: requires the form session token (X-Vestigio-Form-Session). Same
// gate as /run-audit — prevents arbitrary leadId calls from triggering
// crawls against arbitrary domains.
//
// Idempotent: if crawlProgress.status is already "fetching" or "ready",
// returns 200 without re-dispatching. The worker re-checks state inside
// anyway as a second layer.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const formToken = request.headers.get("x-vestigio-form-session");
	const realIp = request.headers.get("x-real-ip");
	const forwarded = request.headers.get("x-forwarded-for");
	const clientIp = realIp?.trim() || (forwarded ? forwarded.split(",").pop()!.trim() : "0.0.0.0");
	const verification = verifyFormToken(formToken, clientIp);
	if (!verification.valid) {
		console.warn(
			`[lead-early-crawl-rejected] reason=${verification.reason} ` +
				`hasToken=${!!formToken} ` +
				`ua=${request.headers.get("user-agent")?.slice(0, 80) ?? "?"}`,
		);
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const { id } = await context.params;

	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		select: { id: true, domain: true, crawlProgress: true, status: true },
	});

	if (!lead) {
		return NextResponse.json({ message: "Lead not found." }, { status: 404 });
	}

	if (!lead.domain) {
		return NextResponse.json(
			{ message: "Domain missing — complete step 1 first." },
			{ status: 400 },
		);
	}

	// Idempotency — short-circuit if already running or done.
	const current = (lead.crawlProgress as unknown as CrawlProgress | null) ?? null;
	if (current?.status === "fetching") {
		return NextResponse.json({ status: "already_running" });
	}
	if (current?.status === "ready") {
		return NextResponse.json({ status: "done" });
	}
	// Spam path: respond like normal but never dispatch.
	if (lead.status === "spam") {
		return NextResponse.json({ status: "started" });
	}

	// Fire-and-forget — the worker handles its own progress writes.
	import("../../../../../../apps/audit-runner/run-early-crawl")
		.then((m) => m.runEarlyCrawl(id))
		.catch((err) => {
			console.error(`[lead-early-crawl] dispatch failed for ${id}:`, err);
		});

	return NextResponse.json({ status: "started" });
}
